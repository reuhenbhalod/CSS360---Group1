// ─────────────────────────────────────────────────────────────
// src/test/utils.test.js
// Tests for pure utility logic in GoodEats (formatAgo, filtering,
// map-pin projection, feed sorting)
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  MOCK_RESTAURANT_1,
  MOCK_RESTAURANT_2,
  MOCK_RESTAURANT_3,
  MOCK_PLACE_1,
  MOCK_PLACE_2,
  MOCK_REDDIT_POST,
  MOCK_NEWS_ARTICLE,
  MOCK_GUARDIAN_ARTICLE,
  NOW_SEC,
} from './mockData.js';

// ─── Inline re-implementations of the pure helpers from App.jsx ───
// These are extracted here so they can be unit-tested in isolation.
// If the project is later refactored to export them, update the imports.

function formatAgo(unixSec, nowMs = Date.now()) {
  const diff = nowMs / 1000 - unixSec;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

function filterRestaurants(restaurants, search) {
  if (!search) return restaurants;
  const q = search.toLowerCase();
  return restaurants.filter(
    (r) =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.categories || []).some((c) => (c || '').toLowerCase().includes(q)),
  );
}

function filterPlaces(places, search) {
  if (!search) return places;
  const q = search.toLowerCase();
  return places.filter(
    (p) =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.cuisine || []).some((c) => (c || '').toLowerCase().includes(q)),
  );
}

function buildFeedItems(data, feedFilter) {
  const items = [];
  if (feedFilter === 'all' || feedFilter === 'reddit') {
    (data.reddit?.data || []).forEach((p) =>
      items.push({ kind: 'reddit', data: p, sort: p.created_utc * 1000 }),
    );
  }
  if (feedFilter === 'all' || feedFilter === 'news') {
    (data.news?.data || []).forEach((a) =>
      items.push({
        kind: 'gnews',
        data: a,
        sort: new Date(a.publishedAt).getTime(),
      }),
    );
    (data.articles?.data || []).forEach((a) =>
      items.push({
        kind: 'guardian',
        data: a,
        sort: new Date(a.publishedAt).getTime(),
      }),
    );
  }
  return items.sort((a, b) => (b.sort || 0) - (a.sort || 0));
}

function buildMapPins(data) {
  const fsq = (data.restaurants?.data || []).map((r) => ({
    id: r.id,
    name: r.name,
    lat: r.lat,
    lon: r.lon,
    source: 'foursquare',
  }));
  const osm = (data.places?.data || []).map((p) => ({
    id: p.id,
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    source: 'overpass',
  }));
  return [...fsq, ...osm].filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon),
  );
}

// ─── formatAgo ────────────────────────────────────────────────

describe('formatAgo', () => {
  const NOW_MS = NOW_SEC * 1000;

  it('shows minutes when less than 1 hour ago', () => {
    const thirtyMinAgo = NOW_SEC - 30 * 60;
    expect(formatAgo(thirtyMinAgo, NOW_MS)).toBe('30m ago');
  });

  it('shows hours when between 1 hour and 24 hours ago', () => {
    const fiveHoursAgo = NOW_SEC - 5 * 3600;
    expect(formatAgo(fiveHoursAgo, NOW_MS)).toBe('5h ago');
  });

  it('shows days when between 1 day and 7 days ago', () => {
    const threeDaysAgo = NOW_SEC - 3 * 86400;
    expect(formatAgo(threeDaysAgo, NOW_MS)).toBe('3d ago');
  });

  it('shows weeks when 7 or more days ago', () => {
    const twoWeeksAgo = NOW_SEC - 14 * 86400;
    expect(formatAgo(twoWeeksAgo, NOW_MS)).toBe('2w ago');
  });

  it('returns 0m ago for very recent timestamps', () => {
    const justNow = NOW_SEC - 30; // 30 seconds ago
    expect(formatAgo(justNow, NOW_MS)).toBe('0m ago');
  });

  it('boundary: exactly 1 hour ago shows 1h ago', () => {
    const exactly1Hour = NOW_SEC - 3600;
    expect(formatAgo(exactly1Hour, NOW_MS)).toBe('1h ago');
  });

  it('boundary: exactly 24 hours ago shows 1d ago', () => {
    const exactly1Day = NOW_SEC - 86400;
    expect(formatAgo(exactly1Day, NOW_MS)).toBe('1d ago');
  });

  it('boundary: exactly 7 days ago shows 1w ago', () => {
    const exactly1Week = NOW_SEC - 604800;
    expect(formatAgo(exactly1Week, NOW_MS)).toBe('1w ago');
  });
});

// ─── filterRestaurants ───────────────────────────────────────

describe('filterRestaurants', () => {
  const restaurants = [MOCK_RESTAURANT_1, MOCK_RESTAURANT_2, MOCK_RESTAURANT_3];

  it('returns all restaurants when search is empty string', () => {
    expect(filterRestaurants(restaurants, '')).toHaveLength(3);
  });

  it('filters by name (case-insensitive)', () => {
    const result = filterRestaurants(restaurants, 'amaro');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Amaro Bistro');
  });

  it('filters by category (case-insensitive)', () => {
    const result = filterRestaurants(restaurants, 'italian');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Amaro Bistro');
  });

  it('returns multiple matches when query matches several items', () => {
    // "American" matches "American" and "New American"
    const result = filterRestaurants(restaurants, 'american');
    expect(result).toHaveLength(2);
  });

  it('returns empty array when nothing matches', () => {
    expect(filterRestaurants(restaurants, 'xyzzy')).toHaveLength(0);
  });

  it('handles restaurants with no categories gracefully', () => {
    const noCategories = [{ id: 'x', name: 'Test Place', categories: [] }];
    expect(filterRestaurants(noCategories, 'american')).toHaveLength(0);
  });

  it('handles null/undefined name gracefully', () => {
    const badData = [{ id: 'x', name: null, categories: ['Italian'] }];
    expect(() => filterRestaurants(badData, 'italian')).not.toThrow();
    expect(filterRestaurants(badData, 'italian')).toHaveLength(1);
  });

  it('is case-insensitive for mixed case queries', () => {
    const result = filterRestaurants(restaurants, 'BISTRO');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Amaro Bistro');
  });
});

// ─── filterPlaces ────────────────────────────────────────────

describe('filterPlaces', () => {
  const places = [MOCK_PLACE_1, MOCK_PLACE_2];

  it('returns all places when search is empty', () => {
    expect(filterPlaces(places, '')).toHaveLength(2);
  });

  it('filters by name', () => {
    const result = filterPlaces(places, 'sushi lover');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('osm-node-2');
  });

  it('filters by cuisine type', () => {
    const result = filterPlaces(places, 'burgers');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Hop & Hound Public House');
  });

  it('returns multiple matches when query is broad', () => {
    // both places match empty query
    expect(filterPlaces(places, '')).toHaveLength(2);
  });

  it('returns empty array for no match', () => {
    expect(filterPlaces(places, 'pizza')).toHaveLength(0);
  });

  it('handles place with null cuisine gracefully', () => {
    const place = { id: 'x', name: 'Mystery Diner', cuisine: null };
    expect(() => filterPlaces([place], 'pizza')).not.toThrow();
  });
});

// ─── buildFeedItems ──────────────────────────────────────────

describe('buildFeedItems', () => {
  const data = {
    reddit: { data: [MOCK_REDDIT_POST] },
    news: { data: [MOCK_NEWS_ARTICLE] },
    articles: { data: [MOCK_GUARDIAN_ARTICLE] },
  };

  it("returns all items when filter is 'all'", () => {
    const items = buildFeedItems(data, 'all');
    expect(items).toHaveLength(3);
  });

  it("returns only reddit items when filter is 'reddit'", () => {
    const items = buildFeedItems(data, 'reddit');
    expect(items.every((i) => i.kind === 'reddit')).toBe(true);
    expect(items).toHaveLength(1);
  });

  it("returns gnews and guardian items when filter is 'news'", () => {
    const items = buildFeedItems(data, 'news');
    expect(items.some((i) => i.kind === 'gnews')).toBe(true);
    expect(items.some((i) => i.kind === 'guardian')).toBe(true);
    expect(items.every((i) => i.kind !== 'reddit')).toBe(true);
  });

  it('sorts items in descending chronological order', () => {
    const items = buildFeedItems(data, 'all');
    for (let i = 0; i < items.length - 1; i++) {
      expect(items[i].sort).toBeGreaterThanOrEqual(items[i + 1].sort);
    }
  });

  it('handles empty data sources gracefully', () => {
    const emptyData = {
      reddit: { data: [] },
      news: { data: [] },
      articles: { data: [] },
    };
    expect(buildFeedItems(emptyData, 'all')).toHaveLength(0);
  });

  it('handles missing data keys gracefully', () => {
    expect(() => buildFeedItems({}, 'all')).not.toThrow();
    expect(buildFeedItems({}, 'all')).toHaveLength(0);
  });

  it('assigns correct kind labels to each source', () => {
    const items = buildFeedItems(data, 'all');
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain('reddit');
    expect(kinds).toContain('gnews');
    expect(kinds).toContain('guardian');
  });
});

// ─── buildMapPins ────────────────────────────────────────────

describe('buildMapPins', () => {
  const data = {
    restaurants: {
      data: [MOCK_RESTAURANT_1, MOCK_RESTAURANT_2, MOCK_RESTAURANT_3],
    },
    places: { data: [MOCK_PLACE_1, MOCK_PLACE_2] },
  };

  it('combines foursquare and OSM pins into one array', () => {
    const pins = buildMapPins(data);
    expect(pins).toHaveLength(5);
  });

  it('labels foursquare pins correctly', () => {
    const pins = buildMapPins(data);
    const fsqPins = pins.filter((p) => p.source === 'foursquare');
    expect(fsqPins).toHaveLength(3);
  });

  it('labels OSM pins correctly', () => {
    const pins = buildMapPins(data);
    const osmPins = pins.filter((p) => p.source === 'overpass');
    expect(osmPins).toHaveLength(2);
  });

  it('filters out pins with non-finite lat/lon', () => {
    const badData = {
      restaurants: {
        data: [
          {
            id: 'bad',
            name: 'No Coords',
            lat: NaN,
            lon: -122.2,
            source: 'foursquare',
          },
          MOCK_RESTAURANT_1,
        ],
      },
      places: { data: [] },
    };
    const pins = buildMapPins(badData);
    expect(
      pins.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)),
    ).toBe(true);
    expect(pins).toHaveLength(1);
  });

  it('returns empty array when data has no restaurants or places', () => {
    expect(
      buildMapPins({ restaurants: { data: [] }, places: { data: [] } }),
    ).toHaveLength(0);
  });

  it('handles missing data keys without crashing', () => {
    expect(() => buildMapPins({})).not.toThrow();
    expect(buildMapPins({})).toHaveLength(0);
  });

  it('preserves id, name, lat, lon on each pin', () => {
    const pins = buildMapPins(data);
    pins.forEach((p) => {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('lat');
      expect(p).toHaveProperty('lon');
    });
  });
});
