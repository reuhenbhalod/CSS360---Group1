// ─────────────────────────────────────────────────────────────
// src/parsers.js
// Normalizers that convert raw upstream API responses into the
// consistent structured format used throughout GoodEats.
//
// Consistent item shapes:
//   Venue    { id, kind: 'restaurant' | 'place', name, categories[],
//              address, city, lat, lon, distance_m,
//              amenity?, cuisine?, outdoor_seating?, takeaway? }
//   FeedItem { id, kind: 'reddit' | 'gnews' | 'guardian',
//              title, body, url, publishedAt (ISO 8601 string),
//              ...type-specific fields preserved for components }
//
// Consistent envelope (one per upstream source):
//   { source, ok, count, data, error }
//
// Every parser is defensive: a missing or malformed field never
// throws — it falls back to a safe default ("", null, []) so a
// broken upstream payload can't crash the UI.
// ─────────────────────────────────────────────────────────────

function num(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function str(v, fallback = '') {
  if (v == null) return fallback;
  return typeof v === 'string' ? v : String(v);
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function osmYesNo(v) {
  if (v === true || v === 'yes') return true;
  if (v === false || v === 'no') return false;
  return undefined;
}

// ─── Venue parsers ───────────────────────────────────────────

// Raw Foursquare Places v3 shape:
//   { fsq_id, name, distance,
//     location: { address, locality, formatted_address },
//     geocodes: { main: { latitude, longitude } },
//     categories: [{ id, name, icon }] }
// Also accepts the already-cleaned shape used in MOCK_FALLBACK.
export function parseFoursquareRestaurant(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const loc = raw.location || {};
  const geo = (raw.geocodes && raw.geocodes.main) || {};
  const cats = arr(raw.categories)
    .map((c) => (typeof c === 'string' ? c : str(c && c.name)))
    .filter(Boolean);
  return {
    id: str(raw.fsq_id ?? raw.id),
    kind: 'restaurant',
    name: str(raw.name),
    categories: cats,
    address: str(raw.address ?? loc.address ?? loc.formatted_address),
    city: raw.city ?? loc.locality ?? null,
    lat: num(raw.lat ?? geo.latitude),
    lon: num(raw.lon ?? geo.longitude),
    distance_m: num(raw.distance_m ?? raw.distance),
  };
}

// Raw Overpass/OSM element shape:
//   { id, type: 'node'|'way', lat, lon,
//     tags: { name, amenity, cuisine: 'a;b;c',
//             'addr:housenumber', 'addr:street',
//             outdoor_seating: 'yes'|'no', takeaway: 'yes'|'no' } }
// Also accepts the already-cleaned shape from MOCK_FALLBACK.
export function parseOverpassPlace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const tags = raw.tags || {};

  let address = str(raw.address);
  if (!address && (tags['addr:housenumber'] || tags['addr:street'])) {
    address = `${tags['addr:housenumber'] || ''} ${tags['addr:street'] || ''}`.trim();
  }

  let cuisine = raw.cuisine != null ? raw.cuisine : tags.cuisine;
  if (typeof cuisine === 'string') {
    cuisine = cuisine.split(';').map((s) => s.trim()).filter(Boolean);
  } else {
    cuisine = arr(cuisine);
  }

  let id;
  if (raw.id != null && typeof raw.id === 'string' && raw.id.startsWith('osm-')) {
    id = raw.id;
  } else if (raw.id != null) {
    id = `osm-${raw.type || 'node'}-${raw.id}`;
  } else {
    id = '';
  }

  const outdoor = raw.outdoor_seating !== undefined
    ? !!raw.outdoor_seating
    : osmYesNo(tags.outdoor_seating);
  const takeaway = raw.takeaway !== undefined
    ? !!raw.takeaway
    : osmYesNo(tags.takeaway);

  return {
    id,
    kind: 'place',
    name: str(raw.name ?? tags.name),
    amenity: raw.amenity ?? tags.amenity ?? null,
    categories: cuisine,
    cuisine,
    address,
    city: raw.city ?? null,
    lat: num(raw.lat),
    lon: num(raw.lon),
    distance_m: num(raw.distance_m),
    outdoor_seating: outdoor,
    takeaway,
  };
}

// ─── Feed-item parsers ───────────────────────────────────────

// Raw Reddit listing children: { kind: 't3', data: { id, title, selftext,
//   author, subreddit_name_prefixed, score, num_comments, created_utc, permalink } }
// `permalink` is path-only — prefix with reddit.com when normalizing.
export function parseRedditPost(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // Accept either a Reddit listing child {kind,data} or an already-flat post.
  const r = raw.data && (raw.data.title || raw.data.id) ? raw.data : raw;

  const permalinkRaw = str(r.permalink);
  const url = permalinkRaw.startsWith('http')
    ? permalinkRaw
    : (permalinkRaw ? `https://reddit.com${permalinkRaw}` : '');

  const authorRaw = str(r.author);
  const author = authorRaw && !authorRaw.startsWith('u/') ? `u/${authorRaw}` : authorRaw;

  const subreddit = str(r.subreddit_name_prefixed ?? r.subreddit);
  const createdUtc = num(r.created_utc);

  return {
    id: str(r.id),
    kind: 'reddit',
    title: str(r.title),
    selftext: str(r.selftext),
    body: str(r.selftext),
    url,
    permalink: url,
    author,
    subreddit,
    score: num(r.score) ?? 0,
    num_comments: num(r.num_comments) ?? 0,
    created_utc: createdUtc,
    publishedAt: createdUtc != null ? new Date(createdUtc * 1000).toISOString() : null,
  };
}

// Raw GNews article shape:
//   { title, description, content, url, image, publishedAt,
//     source: { name, url } }
// The `source: { name }` sub-object is preserved verbatim because
// the NewsArticle component reads `article.source?.name` directly.
export function parseGNewsArticle(raw, idx = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const sourceName = raw.source && typeof raw.source === 'object' ? str(raw.source.name) : '';
  return {
    id: str(raw.id ?? `gnews-${idx}-${raw.url || raw.title || ''}`),
    kind: 'gnews',
    title: str(raw.title),
    description: str(raw.description),
    content: str(raw.content),
    body: str(raw.description || raw.content),
    url: str(raw.url),
    publishedAt: str(raw.publishedAt) || null,
    source: { name: sourceName }, // preserved for component compatibility
  };
}

// Raw Guardian Content API shape:
//   { response: { results: [{ id, webTitle, sectionId, sectionName,
//       webUrl, webPublicationDate, fields: { trailText, byline, bodyText } }] } }
// `parseGuardianArticle` operates on a single result item.
export function parseGuardianArticle(raw, idx = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const fields = raw.fields || {};
  return {
    id: str(raw.id ?? `guardian-${idx}`),
    kind: 'guardian',
    title: str(raw.webTitle ?? raw.title),
    section: str(raw.sectionName ?? raw.section),
    url: str(raw.webUrl ?? raw.url),
    publishedAt: str(raw.webPublicationDate ?? raw.publishedAt) || null,
    trail_text: str(raw.trail_text ?? fields.trailText),
    body: str(raw.trail_text ?? fields.trailText ?? fields.bodyText),
    byline: str(raw.byline ?? fields.byline),
  };
}

// ─── Envelope parsers ────────────────────────────────────────

const SOURCE_TO_PARSER = {
  foursquare: parseFoursquareRestaurant,
  overpass: parseOverpassPlace,
  reddit: parseRedditPost,
  gnews: parseGNewsArticle,
  guardian: parseGuardianArticle,
};

// Convert one per-source envelope `{ source, ok, count, data, error }`
// into the normalized form. `data` is mapped through the appropriate
// item parser. If `ok` is false or `data` is missing, returns an empty
// envelope with the error preserved.
export function parseSourceEnvelope(envelope) {
  const source = envelope && envelope.source;
  const parser = SOURCE_TO_PARSER[source];
  if (!envelope || !parser) {
    return {
      source: str(source) || 'unknown',
      ok: false,
      count: 0,
      data: [],
      error: envelope?.error ?? 'unknown source',
    };
  }
  const rawList = arr(envelope.data);
  const items = rawList.map((item, i) => parser(item, i)).filter(Boolean);
  return {
    source,
    ok: envelope.ok !== false && !envelope.error,
    count: items.length,
    data: items,
    error: envelope.error ?? null,
  };
}

// Top-level normalizer for the `/api/all` response. Walks every
// known source key on the response and produces a same-keyed
// object of normalized envelopes. Unknown keys are dropped.
export function parseApiResponse(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  const sourceKeys = {
    restaurants: 'foursquare',
    places: 'overpass',
    reddit: 'reddit',
    news: 'gnews',
    articles: 'guardian',
  };
  for (const [key, expectedSource] of Object.entries(sourceKeys)) {
    const env = raw[key];
    if (!env) continue;
    // If the envelope is missing `source`, infer it from the key
    // so a backend that only sends `data: [...]` per slot still works.
    const withSource = env.source ? env : { ...env, source: expectedSource };
    out[key] = parseSourceEnvelope(withSource);
  }
  return out;
}
