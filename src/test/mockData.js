// ─────────────────────────────────────────────────────────────
// src/test/mockData.js
// Shared fixtures used across all GoodEats test files
// ─────────────────────────────────────────────────────────────

export const NOW_SEC = 1745798400; // fixed Unix timestamp for deterministic tests

export const MOCK_RESTAURANT_1 = {
  id: 'fsq-1',
  name: 'Beardslee Public House',
  categories: ['American', 'Brewery'],
  address: '11700 Beardslee Blvd',
  city: 'Bothell',
  lat: 47.7623,
  lon: -122.2054,
  distance_m: 120,
};

export const MOCK_RESTAURANT_2 = {
  id: 'fsq-2',
  name: 'Amaro Bistro',
  categories: ['Italian'],
  address: '1002 Main St',
  city: 'Bothell',
  lat: 47.7601,
  lon: -122.2057,
  distance_m: 280,
};

export const MOCK_RESTAURANT_3 = {
  id: 'fsq-3',
  name: 'Preservation Kitchen',
  categories: ['New American'],
  address: '17121 Bothell Way NE',
  city: 'Bothell',
  lat: 47.7589,
  lon: -122.2104,
  distance_m: 540,
};

export const MOCK_PLACE_1 = {
  id: 'osm-node-1',
  name: 'Hop & Hound Public House',
  amenity: 'pub',
  cuisine: ['burgers'],
  address: '10116 Main St',
  lat: 47.7598,
  lon: -122.2049,
  outdoor_seating: true,
  takeaway: false,
};

export const MOCK_PLACE_2 = {
  id: 'osm-node-2',
  name: 'Sushi Lover',
  amenity: 'restaurant',
  cuisine: ['japanese', 'sushi'],
  address: '18336 Bothell Way NE',
  lat: 47.7611,
  lon: -122.2031,
  outdoor_seating: false,
  takeaway: true,
};

export const MOCK_REDDIT_POST = {
  id: 'r1',
  title: 'Best brunch spots in downtown Bothell?',
  selftext: 'Moving to Bothell next month.',
  author: 'u/seattle_foodie',
  subreddit: 'r/Seattle',
  score: 47,
  num_comments: 23,
  created_utc: NOW_SEC - 172800, // 2 days ago
  permalink: 'https://reddit.com/r/Seattle',
};

export const MOCK_NEWS_ARTICLE = {
  id: 'n1',
  title: "Bothell's Main Street revitalization brings six new restaurants",
  description:
    'The Main Street corridor has welcomed a wave of new dining concepts.',
  url: 'https://example.com/1',
  publishedAt: '2026-04-21T14:00:00Z',
  source: { name: 'Seattle Times' },
};

export const MOCK_GUARDIAN_ARTICLE = {
  id: 'g1',
  title: 'How farm-to-table restaurants are reshaping suburban dining',
  section: 'Food',
  url: 'https://theguardian.com/1',
  publishedAt: '2026-04-19T16:00:00Z',
  trail_text: 'A look at how regional sourcing is transforming menus.',
  byline: 'Jay Rayner',
};

export const MOCK_API_RESPONSE = {
  restaurants: {
    source: 'foursquare',
    ok: true,
    count: 3,
    data: [MOCK_RESTAURANT_1, MOCK_RESTAURANT_2, MOCK_RESTAURANT_3],
    error: null,
  },
  places: {
    source: 'overpass',
    ok: true,
    count: 2,
    data: [MOCK_PLACE_1, MOCK_PLACE_2],
    error: null,
  },
  reddit: {
    source: 'reddit',
    ok: true,
    count: 1,
    data: [MOCK_REDDIT_POST],
    error: null,
  },
  news: {
    source: 'gnews',
    ok: true,
    count: 1,
    data: [MOCK_NEWS_ARTICLE],
    error: null,
  },
  articles: {
    source: 'guardian',
    ok: true,
    count: 1,
    data: [MOCK_GUARDIAN_ARTICLE],
    error: null,
  },
};
