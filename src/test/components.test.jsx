// ─────────────────────────────────────────────────────────────
// src/test/components.test.jsx
// Rendering and interaction tests for GoodEats React components
// ─────────────────────────────────────────────────────────────
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GoodEats from '../App.jsx';
import { MOCK_API_RESPONSE } from './mockData.js';

// ─── fetch mock helpers ───────────────────────────────────────

function mockFetchSuccess(data = MOCK_API_RESPONSE) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => data,
  });
}

function mockFetchFailure() {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network Error'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── App bootstrap ───────────────────────────────────────────

describe('GoodEats App — initial render', () => {
  it('renders the masthead title', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('GoodEats');
  });

  it('calls the /api/all endpoint on mount', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/all'),
    );
  });

  it('displays restaurant names after successful fetch', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByText('Beardslee Public House')).toBeInTheDocument(),
    );
  });

  it('displays OSM place names after successful fetch', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByText('Hop & Hound Public House')).toBeInTheDocument(),
    );
  });
});

// ─── Mock-fallback behaviour ─────────────────────────────────

describe('GoodEats App — backend unreachable', () => {
  it('still renders restaurant cards when using mock data', async () => {
    mockFetchFailure();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByText('Beardslee Public House')).toBeInTheDocument(),
    );
  });

  it('does NOT show the mock warning banner when backend responds ok', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.queryByText(/BACKEND UNREACHABLE/i)).not.toBeInTheDocument(),
    );
  });
});

// ─── Status bar ──────────────────────────────────────────────

describe('GoodEats App — status pills', () => {
  it('shows Foursquare status pill', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() => {
      const items = screen.getAllByText('Foursquare');
      expect(items.length).toBeGreaterThan(0);
    });
  });

  it('shows OSM status pill', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() => expect(screen.getByText('OSM')).toBeInTheDocument());
  });

  it('shows Reddit status pill', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() => {
      const items = screen.getAllByText('Reddit');
      expect(items.length).toBeGreaterThan(0);
    });
  });
});

// ─── Search / filter ─────────────────────────────────────────

describe('GoodEats App — search filter', () => {
  it('hides non-matching restaurants when user types a search term', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    const input = await screen.findByPlaceholderText(/filter by name or category/i);

    await userEvent.type(input, 'italian');

    await waitFor(() => {
      expect(screen.queryByText('Beardslee Public House')).not.toBeInTheDocument();
      expect(screen.getByText('Amaro Bistro')).toBeInTheDocument();
    });
  });

  it("shows 'no places match' message when search returns nothing", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    const input = await screen.findByPlaceholderText(/filter by name or category/i);

    await userEvent.type(input, 'xyzzy_nonexistent');

    await waitFor(() =>
      expect(screen.getByText(/no places match/i)).toBeInTheDocument(),
    );
  });

  it('restores all results when search is cleared', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    const input = await screen.findByPlaceholderText(/filter by name or category/i);

    await userEvent.type(input, 'italian');
    await userEvent.clear(input);

    await waitFor(() =>
      expect(screen.getByText('Beardslee Public House')).toBeInTheDocument(),
    );
  });
});

// ─── Feed filter tabs ────────────────────────────────────────

describe('GoodEats App — feed filter tabs', () => {
  it('shows reddit posts when Reddit tab is active', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    const redditBtn = await screen.findByRole('button', { name: /^reddit$/i });

    fireEvent.click(redditBtn);

    await waitFor(() =>
      expect(screen.getByText('Best brunch spots in downtown Bothell?')).toBeInTheDocument(),
    );
  });

  it('shows news articles when News tab is active', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    const newsBtn = await screen.findByRole('button', { name: /^news$/i });

    fireEvent.click(newsBtn);

    await waitFor(() =>
      expect(
        screen.getByText("Bothell's Main Street revitalization brings six new restaurants"),
      ).toBeInTheDocument(),
    );
  });

  it('hides reddit posts when News tab is active', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    const newsBtn = await screen.findByRole('button', { name: /^news$/i });
    fireEvent.click(newsBtn);

    await waitFor(() =>
      expect(screen.queryByText('Best brunch spots in downtown Bothell?')).not.toBeInTheDocument(),
    );
  });

  it('shows all feed items when All tab is clicked after switching', async () => {
    mockFetchSuccess();
    render(<GoodEats />);

    const newsBtn = await screen.findByRole('button', { name: /^news$/i });
    fireEvent.click(newsBtn);

    const allBtn = screen.getByRole('button', { name: /^all$/i });
    fireEvent.click(allBtn);

    await waitFor(() => {
      expect(screen.getByText('Best brunch spots in downtown Bothell?')).toBeInTheDocument();
      expect(
        screen.getByText("Bothell's Main Street revitalization brings six new restaurants"),
      ).toBeInTheDocument();
    });
  });
});

// ─── Refresh button ──────────────────────────────────────────

describe('GoodEats App — refresh button', () => {
  it('renders a Refresh button', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument(),
    );
  });

  it('calls fetch again when Refresh is clicked', async () => {
    mockFetchSuccess();
    render(<GoodEats />);

    const refreshBtn = await screen.findByRole('button', { name: /refresh/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  });
});

// ─── Map view ────────────────────────────────────────────────

describe('GoodEats App — map view', () => {
  it('renders the venue count label', async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByText(/5 VENUES/i)).toBeInTheDocument(),
    );
  });
});

// ─── Footer ──────────────────────────────────────────────────

describe('GoodEats App — footer', () => {
  it("renders the 'no ML' label in the footer", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByText(/NO ML PROCESSING/i)).toBeInTheDocument(),
    );
  });
});