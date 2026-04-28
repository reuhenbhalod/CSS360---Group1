// ─────────────────────────────────────────────────────────────
// src/test/components.test.jsx
// Rendering and interaction tests for GoodEats React components
// ─────────────────────────────────────────────────────────────
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import GoodEats from "../App.jsx";
import {
  MOCK_API_RESPONSE,
  MOCK_RESTAURANT_1,
  MOCK_PLACE_1,
  MOCK_REDDIT_POST,
  MOCK_NEWS_ARTICLE,
  MOCK_GUARDIAN_ARTICLE,
} from "./mockData.js";

// ─── fetch mock helpers ───────────────────────────────────────

function mockFetchSuccess(data = MOCK_API_RESPONSE) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => data,
  });
}

function mockFetchFailure() {
  global.fetch = vi.fn().mockRejectedValue(new Error("Network Error"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── App bootstrap ───────────────────────────────────────────

describe("GoodEats App — initial render", () => {
  it("renders the masthead title", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    // The h1 heading contains "GoodEats" as its text content
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("GoodEats");
  });

  it("shows a loading indicator before data arrives", () => {
    // fetch never resolves during this check
    global.fetch = vi.fn(() => new Promise(() => {}));
    render(<GoodEats />);
    // The main spinner message (not the button label)
    expect(screen.getByText(/Loading data from 5 sources/i)).toBeInTheDocument();
  });

  it("renders the tagline", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    expect(
      screen.getByText(/multi-source dining digest/i)
    ).toBeInTheDocument();
  });

  it("calls the /api/all endpoint on mount", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/all")
    );
  });

  it("displays restaurant names after successful fetch", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByText("Beardslee Public House")).toBeInTheDocument()
    );
  });

  it("displays OSM place names after successful fetch", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByText("Hop & Hound Public House")).toBeInTheDocument()
    );
  });
});

// ─── Mock-fallback behaviour ─────────────────────────────────

describe("GoodEats App — backend unreachable", () => {
  it("falls back to mock data when fetch fails", async () => {
    mockFetchFailure();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByText(/BACKEND UNREACHABLE/i)).toBeInTheDocument()
    );
  });

  it("still renders restaurant cards when using mock data", async () => {
    mockFetchFailure();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByText("Beardslee Public House")).toBeInTheDocument()
    );
  });

  it("does NOT show the mock warning banner when backend responds ok", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.queryByText(/BACKEND UNREACHABLE/i)).not.toBeInTheDocument()
    );
  });
});

// ─── Status bar ──────────────────────────────────────────────

describe("GoodEats App — status pills", () => {
  it("shows Foursquare status pill", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() => {
      // Multiple "Foursquare" spans exist (status bar + restaurant badges); just assert at least one
      const items = screen.getAllByText("Foursquare");
      expect(items.length).toBeGreaterThan(0);
    });
  });

  it("shows OSM status pill", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByText("OSM")).toBeInTheDocument()
    );
  });

  it("shows Reddit status pill", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() => {
      // "Reddit" appears in both the status bar pill and the feed filter button
      const items = screen.getAllByText("Reddit");
      expect(items.length).toBeGreaterThan(0);
    });
  });
});

// ─── Search / filter ─────────────────────────────────────────

describe("GoodEats App — search filter", () => {
  it("renders the search input", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText(/filter by name or category/i)
      ).toBeInTheDocument()
    );
  });

  it("hides non-matching restaurants when user types a search term", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    const input = await screen.findByPlaceholderText(/filter by name or category/i);

    await userEvent.type(input, "italian");

    await waitFor(() => {
      expect(screen.queryByText("Beardslee Public House")).not.toBeInTheDocument();
      expect(screen.getByText("Amaro Bistro")).toBeInTheDocument();
    });
  });

  it("shows 'no places match' message when search returns nothing", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    const input = await screen.findByPlaceholderText(/filter by name or category/i);

    await userEvent.type(input, "xyzzy_nonexistent");

    await waitFor(() =>
      expect(screen.getByText(/no places match/i)).toBeInTheDocument()
    );
  });

  it("restores all results when search is cleared", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    const input = await screen.findByPlaceholderText(/filter by name or category/i);

    await userEvent.type(input, "italian");
    await userEvent.clear(input);

    await waitFor(() =>
      expect(screen.getByText("Beardslee Public House")).toBeInTheDocument()
    );
  });
});

// ─── Feed filter tabs ────────────────────────────────────────

describe("GoodEats App — feed filter tabs", () => {
  it("renders All, Reddit, and News tab buttons", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^reddit$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^news$/i })).toBeInTheDocument();
    });
  });

  it("shows reddit posts when Reddit tab is active", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    const redditBtn = await screen.findByRole("button", { name: /^reddit$/i });

    fireEvent.click(redditBtn);

    await waitFor(() =>
      expect(
        screen.getByText("Best brunch spots in downtown Bothell?")
      ).toBeInTheDocument()
    );
  });

  it("shows news articles when News tab is active", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    const newsBtn = await screen.findByRole("button", { name: /^news$/i });

    fireEvent.click(newsBtn);

    await waitFor(() =>
      expect(
        screen.getByText(
          "Bothell's Main Street revitalization brings six new restaurants"
        )
      ).toBeInTheDocument()
    );
  });

  it("hides reddit posts when News tab is active", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    const newsBtn = await screen.findByRole("button", { name: /^news$/i });
    fireEvent.click(newsBtn);

    await waitFor(() =>
      expect(
        screen.queryByText("Best brunch spots in downtown Bothell?")
      ).not.toBeInTheDocument()
    );
  });

  it("shows all feed items when All tab is clicked after switching", async () => {
    mockFetchSuccess();
    render(<GoodEats />);

    const newsBtn = await screen.findByRole("button", { name: /^news$/i });
    fireEvent.click(newsBtn);

    const allBtn = screen.getByRole("button", { name: /^all$/i });
    fireEvent.click(allBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Best brunch spots in downtown Bothell?")
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Bothell's Main Street revitalization brings six new restaurants"
        )
      ).toBeInTheDocument();
    });
  });
});

// ─── Refresh button ──────────────────────────────────────────

describe("GoodEats App — refresh button", () => {
  it("renders a Refresh button", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument()
    );
  });

  it("calls fetch again when Refresh is clicked", async () => {
    mockFetchSuccess();
    render(<GoodEats />);

    const refreshBtn = await screen.findByRole("button", { name: /refresh/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});

// ─── Map view ────────────────────────────────────────────────

describe("GoodEats App — map view", () => {
  it("renders the Geographic Overview section heading", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByText(/geographic overview/i)).toBeInTheDocument()
    );
  });

  it("renders the venue count label", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    // 3 foursquare + 2 OSM = 5 venues
    await waitFor(() =>
      expect(screen.getByText(/5 VENUES/i)).toBeInTheDocument()
    );
  });
});

// ─── Footer ──────────────────────────────────────────────────

describe("GoodEats App — footer", () => {
  it("renders the version info in the footer", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByText(/v0\.5/i)).toBeInTheDocument()
    );
  });

  it("renders the 'no ML' label in the footer", async () => {
    mockFetchSuccess();
    render(<GoodEats />);
    await waitFor(() =>
      expect(screen.getByText(/NO ML PROCESSING/i)).toBeInTheDocument()
    );
  });
});
