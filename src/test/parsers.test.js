// ─────────────────────────────────────────────────────────────
// src/test/parsers.test.js
// Verifies the acceptance criterion:
//   "Raw API responses are parsed into a consistent, structured format."
//
// Each suite feeds a parser the *native* upstream shape (what
// Foursquare / Overpass / Reddit / GNews / Guardian actually send
// over the wire) and asserts the output matches the documented
// normalized shape.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  parseFoursquareRestaurant,
  parseOverpassPlace,
  parseRedditPost,
  parseGNewsArticle,
  parseGuardianArticle,
  parseSourceEnvelope,
  parseApiResponse,
} from '../parsers.js';

// ─── Foursquare ──────────────────────────────────────────────

describe('parseFoursquareRestaurant', () => {
  const rawFsq = {
    fsq_id: 'abc123',
    name: 'Beardslee Public House',
    distance: 120,
    location: {
      address: '11700 Beardslee Blvd',
      locality: 'Bothell',
      formatted_address: '11700 Beardslee Blvd, Bothell, WA',
    },
    geocodes: { main: { latitude: 47.7623, longitude: -122.2054 } },
    categories: [
      { id: 1, name: 'American' },
      { id: 2, name: 'Brewery' },
    ],
  };

  it('maps native Foursquare v3 fields to normalized shape', () => {
    const out = parseFoursquareRestaurant(rawFsq);
    expect(out).toMatchObject({
      id: 'abc123',
      kind: 'restaurant',
      name: 'Beardslee Public House',
      categories: ['American', 'Brewery'],
      address: '11700 Beardslee Blvd',
      city: 'Bothell',
      lat: 47.7623,
      lon: -122.2054,
      distance_m: 120,
    });
  });

  it('accepts the already-cleaned mock shape (id, lat, lon, distance_m)', () => {
    const out = parseFoursquareRestaurant({
      id: 'fsq-1',
      name: 'Amaro',
      categories: ['Italian'],
      address: '1002 Main',
      city: 'Bothell',
      lat: 47.76,
      lon: -122.2,
      distance_m: 280,
    });
    expect(out.id).toBe('fsq-1');
    expect(out.categories).toEqual(['Italian']);
    expect(out.lat).toBe(47.76);
    expect(out.distance_m).toBe(280);
  });

  it('returns null for non-object input', () => {
    expect(parseFoursquareRestaurant(null)).toBeNull();
    expect(parseFoursquareRestaurant('string')).toBeNull();
    expect(parseFoursquareRestaurant(undefined)).toBeNull();
  });

  it('handles missing/partial fields without throwing', () => {
    const out = parseFoursquareRestaurant({ fsq_id: 'x', name: 'Bare' });
    expect(out).toEqual({
      id: 'x',
      kind: 'restaurant',
      name: 'Bare',
      categories: [],
      address: '',
      city: null,
      lat: null,
      lon: null,
      distance_m: null,
    });
  });

  it('coerces string lat/lon to numbers and rejects garbage', () => {
    const out = parseFoursquareRestaurant({
      fsq_id: 'x',
      geocodes: { main: { latitude: '47.76', longitude: 'not-a-number' } },
    });
    expect(out.lat).toBe(47.76);
    expect(out.lon).toBeNull();
  });

  it('skips category entries that are missing a name', () => {
    const out = parseFoursquareRestaurant({
      fsq_id: 'x',
      categories: [{ id: 1, name: 'Pizza' }, { id: 2 }, { id: 3, name: '' }],
    });
    expect(out.categories).toEqual(['Pizza']);
  });
});

// ─── Overpass / OSM ──────────────────────────────────────────

describe('parseOverpassPlace', () => {
  const rawOsm = {
    type: 'node',
    id: 12345,
    lat: 47.7598,
    lon: -122.2049,
    tags: {
      name: 'Hop & Hound Public House',
      amenity: 'pub',
      cuisine: 'burgers;american',
      'addr:housenumber': '10116',
      'addr:street': 'Main St',
      outdoor_seating: 'yes',
      takeaway: 'no',
    },
  };

  it('maps native Overpass element to normalized shape', () => {
    const out = parseOverpassPlace(rawOsm);
    expect(out).toMatchObject({
      id: 'osm-node-12345',
      kind: 'place',
      name: 'Hop & Hound Public House',
      amenity: 'pub',
      cuisine: ['burgers', 'american'],
      address: '10116 Main St',
      lat: 47.7598,
      lon: -122.2049,
      outdoor_seating: true,
      takeaway: false,
    });
  });

  it('splits semicolon-delimited cuisine into an array', () => {
    const out = parseOverpassPlace({
      type: 'node',
      id: 1,
      tags: { name: 'X', cuisine: 'japanese; sushi ; ramen' },
    });
    expect(out.cuisine).toEqual(['japanese', 'sushi', 'ramen']);
  });

  it('treats missing outdoor_seating/takeaway tags as undefined (not false)', () => {
    const out = parseOverpassPlace({
      type: 'node',
      id: 1,
      tags: { name: 'X' },
    });
    expect(out.outdoor_seating).toBeUndefined();
    expect(out.takeaway).toBeUndefined();
  });

  it('preserves already-prefixed osm- ids from the cleaned shape', () => {
    const out = parseOverpassPlace({
      id: 'osm-node-1',
      name: 'Pre-cleaned',
      cuisine: ['sushi'],
      lat: 47.76,
      lon: -122.2,
    });
    expect(out.id).toBe('osm-node-1');
    expect(out.cuisine).toEqual(['sushi']);
  });

  it('returns null for non-object input', () => {
    expect(parseOverpassPlace(null)).toBeNull();
    expect(parseOverpassPlace(42)).toBeNull();
  });

  it('handles way-type elements (not just nodes)', () => {
    const out = parseOverpassPlace({
      type: 'way',
      id: 999,
      lat: 1,
      lon: 2,
      tags: { name: 'Plaza', amenity: 'food_court' },
    });
    expect(out.id).toBe('osm-way-999');
    expect(out.amenity).toBe('food_court');
  });
});

// ─── Reddit ──────────────────────────────────────────────────

describe('parseRedditPost', () => {
  const rawReddit = {
    kind: 't3',
    data: {
      id: 'r1',
      title: 'Best brunch in Bothell?',
      selftext: 'Looking for recommendations.',
      author: 'seattle_foodie',
      subreddit_name_prefixed: 'r/Seattle',
      score: 47,
      num_comments: 23,
      created_utc: 1745798400,
      permalink: '/r/Seattle/comments/abc/best_brunch/',
    },
  };

  it('unwraps Reddit listing child and normalizes fields', () => {
    const out = parseRedditPost(rawReddit);
    expect(out).toMatchObject({
      id: 'r1',
      kind: 'reddit',
      title: 'Best brunch in Bothell?',
      selftext: 'Looking for recommendations.',
      author: 'u/seattle_foodie',
      subreddit: 'r/Seattle',
      score: 47,
      num_comments: 23,
      created_utc: 1745798400,
    });
    expect(out.url).toBe('https://reddit.com/r/Seattle/comments/abc/best_brunch/');
  });

  it('passes through an already-prefixed author', () => {
    const out = parseRedditPost({
      id: 'x',
      title: 't',
      author: 'u/already_prefixed',
    });
    expect(out.author).toBe('u/already_prefixed');
  });

  it('emits ISO publishedAt from created_utc', () => {
    const out = parseRedditPost({
      id: 'x',
      title: 't',
      created_utc: 1745798400,
    });
    expect(out.publishedAt).toBe(new Date(1745798400 * 1000).toISOString());
  });

  it('passes through absolute permalinks unchanged', () => {
    const out = parseRedditPost({
      id: 'x',
      title: 't',
      permalink: 'https://old.reddit.com/r/x/abc',
    });
    expect(out.url).toBe('https://old.reddit.com/r/x/abc');
  });

  it('defaults score and num_comments to 0 when missing', () => {
    const out = parseRedditPost({ id: 'x', title: 't' });
    expect(out.score).toBe(0);
    expect(out.num_comments).toBe(0);
  });

  it('returns null for non-object input', () => {
    expect(parseRedditPost(null)).toBeNull();
  });
});

// ─── GNews ───────────────────────────────────────────────────

describe('parseGNewsArticle', () => {
  const rawGNews = {
    title: 'Bothell main street revitalization',
    description: 'New restaurants are arriving.',
    content: 'Full body text…',
    url: 'https://example.com/news/1',
    publishedAt: '2026-04-21T14:00:00Z',
    source: { name: 'Seattle Times', url: 'https://seattletimes.com' },
  };

  it('maps native GNews article to normalized shape', () => {
    const out = parseGNewsArticle(rawGNews, 0);
    expect(out).toMatchObject({
      kind: 'gnews',
      title: 'Bothell main street revitalization',
      description: 'New restaurants are arriving.',
      url: 'https://example.com/news/1',
      publishedAt: '2026-04-21T14:00:00Z',
    });
    expect(out.source).toEqual({ name: 'Seattle Times' });
  });

  it('synthesizes a stable id when none is provided', () => {
    const a = parseGNewsArticle(rawGNews, 0);
    const b = parseGNewsArticle(rawGNews, 0);
    expect(a.id).toBe(b.id);
    expect(a.id).toContain('gnews-0');
  });

  it('uses description as body when present, falls back to content', () => {
    const a = parseGNewsArticle(rawGNews);
    expect(a.body).toBe('New restaurants are arriving.');
    const b = parseGNewsArticle({
      title: 't',
      url: 'u',
      publishedAt: 'x',
      content: 'fallback body',
    });
    expect(b.body).toBe('fallback body');
  });

  it('returns null for non-object input', () => {
    expect(parseGNewsArticle(null)).toBeNull();
  });

  it('handles missing source.name without throwing', () => {
    const out = parseGNewsArticle({ title: 't', url: 'u', publishedAt: 'x' });
    expect(out.source).toEqual({ name: '' });
  });
});

// ─── Guardian ────────────────────────────────────────────────

describe('parseGuardianArticle', () => {
  const rawGuardian = {
    id: 'food/2026/apr/19/farm-to-table',
    webTitle: 'How farm-to-table restaurants are reshaping dining',
    sectionId: 'food',
    sectionName: 'Food',
    webUrl: 'https://theguardian.com/food/2026/apr/19/farm-to-table',
    webPublicationDate: '2026-04-19T16:00:00Z',
    fields: {
      trailText: 'A look at regional sourcing.',
      byline: 'Jay Rayner',
      bodyText: 'Long form body…',
    },
  };

  it('maps native Guardian Content API item to normalized shape', () => {
    const out = parseGuardianArticle(rawGuardian);
    expect(out).toMatchObject({
      id: 'food/2026/apr/19/farm-to-table',
      kind: 'guardian',
      title: 'How farm-to-table restaurants are reshaping dining',
      section: 'Food',
      url: 'https://theguardian.com/food/2026/apr/19/farm-to-table',
      publishedAt: '2026-04-19T16:00:00Z',
      trail_text: 'A look at regional sourcing.',
      byline: 'Jay Rayner',
    });
  });

  it('accepts the already-cleaned mock shape (section, trail_text, publishedAt)', () => {
    const out = parseGuardianArticle({
      id: 'g1',
      title: 'X',
      section: 'Food',
      url: 'https://x',
      publishedAt: '2026-01-01T00:00:00Z',
      trail_text: 'trail',
      byline: 'Y',
    });
    expect(out.title).toBe('X');
    expect(out.trail_text).toBe('trail');
  });

  it('falls back to body text when no trail text is provided', () => {
    const out = parseGuardianArticle({
      webTitle: 't',
      fields: { bodyText: 'body only' },
    });
    expect(out.body).toBe('body only');
  });

  it('returns null for non-object input', () => {
    expect(parseGuardianArticle(undefined)).toBeNull();
  });
});

// ─── Envelope parsers ────────────────────────────────────────

describe('parseSourceEnvelope', () => {
  it('parses a healthy Foursquare envelope', () => {
    const env = parseSourceEnvelope({
      source: 'foursquare',
      ok: true,
      count: 1,
      data: [{ fsq_id: 'a', name: 'X', categories: [{ name: 'Pizza' }] }],
      error: null,
    });
    expect(env.source).toBe('foursquare');
    expect(env.ok).toBe(true);
    expect(env.count).toBe(1);
    expect(env.data[0]).toMatchObject({ id: 'a', name: 'X', kind: 'restaurant' });
  });

  it('marks envelope as not-ok when error is set', () => {
    const env = parseSourceEnvelope({
      source: 'reddit',
      ok: true,
      data: [],
      error: 'rate limited',
    });
    expect(env.ok).toBe(false);
    expect(env.error).toBe('rate limited');
    expect(env.data).toEqual([]);
  });

  it('drops items that fail to parse and recomputes count', () => {
    const env = parseSourceEnvelope({
      source: 'foursquare',
      ok: true,
      data: [null, { fsq_id: 'a', name: 'A' }, 42, { fsq_id: 'b', name: 'B' }],
      error: null,
    });
    expect(env.count).toBe(2);
    expect(env.data.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('returns a safe empty envelope when given garbage', () => {
    const env = parseSourceEnvelope(null);
    expect(env).toMatchObject({ source: 'unknown', ok: false, count: 0, data: [] });
  });

  it('rejects an unknown source string with a clear error', () => {
    const env = parseSourceEnvelope({ source: 'yelp', data: [{ id: 1 }] });
    expect(env.ok).toBe(false);
    expect(env.error).toBe('unknown source');
  });
});

describe('parseApiResponse', () => {
  // Mixed payload using the *native* upstream shapes for each source.
  const rawApi = {
    restaurants: {
      source: 'foursquare',
      ok: true,
      data: [
        {
          fsq_id: 'a',
          name: 'A',
          location: { address: '1 Main', locality: 'Bothell' },
          geocodes: { main: { latitude: 47.76, longitude: -122.2 } },
          categories: [{ name: 'American' }],
          distance: 100,
        },
      ],
      error: null,
    },
    places: {
      source: 'overpass',
      ok: true,
      data: [
        { type: 'node', id: 1, lat: 47.76, lon: -122.2, tags: { name: 'P', amenity: 'pub', cuisine: 'pub_food' } },
      ],
      error: null,
    },
    reddit: {
      source: 'reddit',
      ok: true,
      data: [
        { kind: 't3', data: { id: 'r', title: 'T', created_utc: 1745798400, permalink: '/r/x/abc' } },
      ],
      error: null,
    },
    news: {
      source: 'gnews',
      ok: false,
      data: [],
      error: 'GNEWS_QUOTA_EXCEEDED',
    },
    articles: {
      source: 'guardian',
      ok: true,
      data: [
        { id: 'g1', webTitle: 'G', sectionName: 'Food', webUrl: 'u', webPublicationDate: '2026-04-01T00:00:00Z' },
      ],
      error: null,
    },
  };

  it('normalizes every known source key in the response', () => {
    const out = parseApiResponse(rawApi);
    expect(Object.keys(out).sort()).toEqual(['articles', 'news', 'places', 'reddit', 'restaurants']);
  });

  it('produces a consistent envelope shape across every source', () => {
    const out = parseApiResponse(rawApi);
    for (const key of ['restaurants', 'places', 'reddit', 'news', 'articles']) {
      const env = out[key];
      expect(env).toHaveProperty('source');
      expect(env).toHaveProperty('ok');
      expect(env).toHaveProperty('count');
      expect(env).toHaveProperty('data');
      expect(env).toHaveProperty('error');
      expect(Array.isArray(env.data)).toBe(true);
      expect(typeof env.ok).toBe('boolean');
      expect(typeof env.count).toBe('number');
    }
  });

  it('every parsed venue carries the documented venue fields', () => {
    const out = parseApiResponse(rawApi);
    for (const key of ['restaurants', 'places']) {
      for (const item of out[key].data) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('kind');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('categories');
        expect(item).toHaveProperty('lat');
        expect(item).toHaveProperty('lon');
        expect(item).toHaveProperty('distance_m');
      }
    }
  });

  it('every parsed feed item carries title + url + publishedAt + kind', () => {
    const out = parseApiResponse(rawApi);
    const feed = [...out.reddit.data, ...out.news.data, ...out.articles.data];
    for (const item of feed) {
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('url');
      expect(item).toHaveProperty('publishedAt');
      expect(['reddit', 'gnews', 'guardian']).toContain(item.kind);
    }
  });

  it('preserves errors from failed upstream sources', () => {
    const out = parseApiResponse(rawApi);
    expect(out.news.ok).toBe(false);
    expect(out.news.error).toBe('GNEWS_QUOTA_EXCEEDED');
    expect(out.news.data).toEqual([]);
  });

  it('infers source from envelope key when the envelope omits source', () => {
    const out = parseApiResponse({
      restaurants: { ok: true, data: [{ fsq_id: 'x', name: 'X' }] },
    });
    expect(out.restaurants.source).toBe('foursquare');
    expect(out.restaurants.data[0].id).toBe('x');
  });

  it('returns null for non-object input', () => {
    expect(parseApiResponse(null)).toBeNull();
    expect(parseApiResponse('nope')).toBeNull();
  });

  it('skips unknown response keys', () => {
    const out = parseApiResponse({
      restaurants: { ok: true, data: [] },
      junk: { ok: true, data: [{ unrelated: true }] },
    });
    expect(out).not.toHaveProperty('junk');
  });
});
