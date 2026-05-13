import { useState, useEffect, useMemo } from "react";
import { MapPin, MessageSquare, Newspaper, Map as MapIcon, Search, RefreshCw, AlertCircle, CheckCircle2, Shuffle } from "lucide-react";

// ============================================================
// GoodEats v0.5 - Bothell, WA Dashboard
// Phase 1: Raw API data only, no ML processing
// Sources: Foursquare, OpenStreetMap, Reddit, GNews, Guardian
// ============================================================

const API_BASE = "http://localhost:8000";

// Mock data fallback so the demo never hard-fails if backend is down.
const MOCK_FALLBACK = {
  restaurants: { source: "foursquare", ok: true, count: 3, data: [
    { id: "fsq-1", name: "Beardslee Public House", categories: ["American","Brewery"], address: "11700 Beardslee Blvd", city: "Bothell", lat: 47.7623, lon: -122.2054, distance_m: 120 },
    { id: "fsq-2", name: "Amaro Bistro", categories: ["Italian"], address: "1002 Main St", city: "Bothell", lat: 47.7601, lon: -122.2057, distance_m: 280 },
    { id: "fsq-3", name: "Preservation Kitchen", categories: ["New American"], address: "17121 Bothell Way NE", city: "Bothell", lat: 47.7589, lon: -122.2104, distance_m: 540 },
  ], error: null },
  places: { source: "overpass", ok: true, count: 2, data: [
    { id: "osm-node-1", name: "Hop & Hound Public House", amenity: "pub", cuisine: ["burgers"], address: "10116 Main St", lat: 47.7598, lon: -122.2049, outdoor_seating: true, takeaway: false },
    { id: "osm-node-2", name: "Sushi Lover", amenity: "restaurant", cuisine: ["japanese","sushi"], address: "18336 Bothell Way NE", lat: 47.7611, lon: -122.2031, outdoor_seating: false, takeaway: true },
  ], error: null },
  reddit: { source: "reddit", ok: true, count: 2, data: [
    { id: "r1", title: "Best brunch spots in downtown Bothell?", selftext: "Moving to Bothell next month and looking for solid weekend brunch options.", author: "u/seattle_foodie", subreddit: "r/Seattle", score: 47, num_comments: 23, created_utc: Date.now()/1000 - 172800, permalink: "https://reddit.com/r/Seattle" },
    { id: "r2", title: "Preservation Kitchen lived up to the hype", selftext: "Finally tried it last weekend. The seasonal menu is no joke.", author: "u/pnw_eats", subreddit: "r/Seattle", score: 89, num_comments: 41, created_utc: Date.now()/1000 - 432000, permalink: "https://reddit.com/r/Seattle" },
  ], error: null },
  news: { source: "gnews", ok: true, count: 2, data: [
    { id: "n1", title: "Bothell's Main Street revitalization brings six new restaurants", description: "The Main Street corridor has welcomed a wave of new dining concepts.", url: "https://example.com/1", publishedAt: "2026-04-21T14:00:00Z", source: { name: "Seattle Times" } },
    { id: "n2", title: "Local brewery Beardslee announces expansion into Canyon Park", description: "The popular gastropub plans to open a second location by late summer.", url: "https://example.com/2", publishedAt: "2026-04-18T09:30:00Z", source: { name: "Bothell-Kenmore Reporter" } },
  ], error: null },
  articles: { source: "guardian", ok: true, count: 2, data: [
    { id: "g1", title: "How farm-to-table restaurants are reshaping suburban dining", section: "Food", url: "https://theguardian.com/1", publishedAt: "2026-04-19T16:00:00Z", trail_text: "A look at how regional sourcing is transforming menus outside of major metros.", byline: "Jay Rayner" },
    { id: "g2", title: "The Pacific Northwest's quiet restaurant boom", section: "Food", url: "https://theguardian.com/2", publishedAt: "2026-04-12T11:00:00Z", trail_text: "Beyond Seattle's core, smaller cities are claiming culinary attention.", byline: "Food Desk" },
  ], error: null },
};

function SourceBadge({ source }) {
  const config = {
    foursquare: { label: "Foursquare", color: "#F94877", bg: "#FFF0F4" },
    overpass: { label: "OpenStreetMap", color: "#5B4B8A", bg: "#F2EFF8" },
    reddit: { label: "Reddit", color: "#D93900", bg: "#FFF4F0" },
    gnews: { label: "GNews", color: "#1A4D8F", bg: "#EEF3FA" },
    guardian: { label: "The Guardian", color: "#052962", bg: "#EAEEF5" },
  };
  const c = config[source] || { label: source, color: "#374151", bg: "#F3F4F6" };
  return (
    <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.color, background: c.bg, padding: "3px 8px", borderRadius: "2px", border: `1px solid ${c.color}20`, fontFamily: "'JetBrains Mono', monospace" }}>
      {c.label}
    </span>
  );
}

function StatusPill({ ok, count, source }) {
  const sourceLabel = { foursquare: "Foursquare", overpass: "OSM", reddit: "Reddit", gnews: "GNews", guardian: "Guardian" }[source];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", background: ok ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${ok ? "#86EFAC" : "#FCA5A5"}`, fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" }}>
      {ok ? <CheckCircle2 size={12} color="#16A34A" /> : <AlertCircle size={12} color="#DC2626" />}
      <span style={{ fontWeight: 600, color: ok ? "#166534" : "#991B1B" }}>{sourceLabel}</span>
      <span style={{ color: ok ? "#16A34A" : "#DC2626" }}>{ok ? `${count}` : "ERR"}</span>
    </div>
  );
}

function RestaurantCard({ r, onHover, onLeave, isHighlighted }) {
  return (
    <div onMouseEnter={() => onHover(r.id)} onMouseLeave={onLeave} style={{ background: "white", border: isHighlighted ? "1px solid #1F2937" : "1px solid #E5E7EB", boxShadow: isHighlighted ? "0 4px 12px rgba(0,0,0,0.08)" : "none", padding: "18px", transition: "all 0.15s ease", cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <SourceBadge source="foursquare" />
        {r.distance_m != null && <span style={{ fontSize: "11px", color: "#6B7280", fontFamily: "'JetBrains Mono', monospace" }}>{r.distance_m}m</span>}
      </div>
      <h3 style={{ fontFamily: "'Source Serif Pro', Georgia, serif", fontSize: "19px", fontWeight: 600, color: "#111827", margin: "0 0 6px 0", lineHeight: 1.25 }}>{r.name}</h3>
      <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
        <MapPin size={12} strokeWidth={1.5} />{r.address || r.city}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {(r.categories || []).slice(0, 3).map((c) => (
          <span key={c} style={{ fontSize: "11px", color: "#374151", background: "#F3F4F6", padding: "2px 8px", borderRadius: "2px" }}>{c}</span>
        ))}
      </div>
    </div>
  );
}

function PlaceCard({ p, onHover, onLeave, isHighlighted }) {
  return (
    <div onMouseEnter={() => onHover(p.id)} onMouseLeave={onLeave} style={{ background: "white", border: isHighlighted ? "1px solid #1F2937" : "1px solid #E5E7EB", boxShadow: isHighlighted ? "0 4px 12px rgba(0,0,0,0.08)" : "none", padding: "16px", transition: "all 0.15s ease", cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <SourceBadge source="overpass" />
        <span style={{ fontSize: "10px", color: "#6B7280", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>{p.amenity}</span>
      </div>
      <h3 style={{ fontFamily: "'Source Serif Pro', Georgia, serif", fontSize: "16px", fontWeight: 600, color: "#111827", margin: "0 0 4px 0", lineHeight: 1.25 }}>{p.name}</h3>
      {p.address && <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "6px" }}>{p.address}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "6px" }}>
        {(p.cuisine || []).slice(0, 3).filter(Boolean).map((c) => (
          <span key={c} style={{ fontSize: "10px", color: "#374151", background: "#F3F4F6", padding: "1px 6px", borderRadius: "2px" }}>{c}</span>
        ))}
        {p.outdoor_seating && <span style={{ fontSize: "10px", color: "#166534", background: "#F0FDF4", padding: "1px 6px", borderRadius: "2px" }}>outdoor</span>}
        {p.takeaway && <span style={{ fontSize: "10px", color: "#1E3A8A", background: "#EFF6FF", padding: "1px 6px", borderRadius: "2px" }}>takeaway</span>}
      </div>
    </div>
  );
}

function formatAgo(unixSec) {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

function RedditPost({ post }) {
  const ago = post.created_utc ? formatAgo(post.created_utc) : "";
  return (
    <div style={{ padding: "16px 0", borderBottom: "1px solid #E5E7EB" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <SourceBadge source="reddit" />
        <span style={{ fontSize: "11px", color: "#9CA3AF", fontFamily: "'JetBrains Mono', monospace" }}>{post.subreddit} · {ago}</span>
      </div>
      <h4 style={{ fontFamily: "'Source Serif Pro', Georgia, serif", fontSize: "15px", fontWeight: 600, color: "#111827", margin: "0 0 6px 0", lineHeight: 1.3 }}>
        <a href={post.permalink} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{post.title}</a>
      </h4>
      {post.selftext && <p style={{ fontSize: "13px", color: "#4B5563", lineHeight: 1.5, margin: "0 0 8px 0" }}>{post.selftext}</p>}
      <div style={{ display: "flex", gap: "14px", fontSize: "11px", color: "#6B7280", fontFamily: "'JetBrains Mono', monospace" }}>
        <span>↑ {post.score}</span>
        <span style={{ display: "flex", alignItems: "center", gap: "3px" }}><MessageSquare size={11} strokeWidth={1.5} />{post.num_comments}</span>
        <span>{post.author}</span>
      </div>
    </div>
  );
}

function NewsArticle({ article, source }) {
  const date = article.publishedAt ? new Date(article.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const sourceName = source === "gnews" ? article.source?.name : (source === "guardian" ? article.section : "");
  const text = article.description || article.trail_text || article.content;
  return (
    <div style={{ padding: "16px 0", borderBottom: "1px solid #E5E7EB" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <SourceBadge source={source} />
        <span style={{ fontSize: "11px", color: "#9CA3AF", fontFamily: "'JetBrains Mono', monospace" }}>{date}</span>
      </div>
      <h4 style={{ fontFamily: "'Source Serif Pro', Georgia, serif", fontSize: "15px", fontWeight: 600, color: "#111827", margin: "0 0 6px 0", lineHeight: 1.3 }}>
        <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{article.title}</a>
      </h4>
      {text && <p style={{ fontSize: "13px", color: "#4B5563", lineHeight: 1.5, margin: "0 0 8px 0" }}>{text}</p>}
      {sourceName && (
        <div style={{ fontSize: "11px", color: "#6B7280", fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: "5px" }}>
          <Newspaper size={11} strokeWidth={1.5} />{sourceName}
          {article.byline && <span style={{ marginLeft: "4px" }}>· {article.byline}</span>}
        </div>
      )}
    </div>
  );
}

function MapView({ pins, highlighted, onPinHover, onPinLeave }) {
  if (!pins.length) {
    return <div style={{ height: "320px", border: "1px solid #E5E7EB", background: "#FAFAF7", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontStyle: "italic" }}>No location data available.</div>;
  }
  const lats = pins.map((p) => p.lat).filter(Number.isFinite);
  const lons = pins.map((p) => p.lon).filter(Number.isFinite);
  const minLat = Math.min(...lats) - 0.003;
  const maxLat = Math.max(...lats) + 0.003;
  const minLon = Math.min(...lons) - 0.003;
  const maxLon = Math.max(...lons) + 0.003;

  const project = (lat, lon) => {
    const x = ((lon - minLon) / (maxLon - minLon)) * 100;
    const y = (1 - (lat - minLat) / (maxLat - minLat)) * 100;
    return { x, y };
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "320px", background: "#FAFAF7", border: "1px solid #E5E7EB", overflow: "hidden" }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#E5E7EB" strokeWidth="0.15" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />
        <path d="M 0 45 Q 30 40 50 50 T 100 55" fill="none" stroke="#C7D2D8" strokeWidth="0.6" opacity="0.6" />
        <path d="M 20 0 L 22 100" fill="none" stroke="#D5DCE0" strokeWidth="0.4" opacity="0.5" />
        <path d="M 0 70 L 100 68" fill="none" stroke="#D5DCE0" strokeWidth="0.4" opacity="0.5" />
      </svg>
      {pins.map((p) => {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
        const { x, y } = project(p.lat, p.lon);
        const isActive = highlighted === p.id;
        return (
          <div key={p.id} onMouseEnter={() => onPinHover(p.id)} onMouseLeave={onPinLeave} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -100%)", cursor: "pointer", zIndex: isActive ? 10 : 1 }}>
            <div style={{ width: isActive ? "14px" : "10px", height: isActive ? "14px" : "10px", background: isActive ? "#B45309" : (p.source === "foursquare" ? "#1F2937" : "#5B4B8A"), border: "2px solid white", borderRadius: "50%", boxShadow: "0 2px 4px rgba(0,0,0,0.2)", transition: "all 0.15s ease" }} />
            {isActive && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", background: "white", border: "1px solid #1F2937", padding: "4px 8px", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap", fontFamily: "'Source Serif Pro', Georgia, serif" }}>{p.name}</div>
            )}
          </div>
        );
      })}
      <div style={{ position: "absolute", bottom: "10px", left: "12px", fontSize: "10px", color: "#6B7280", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em" }}>BOTHELL, WA · 47.76°N 122.20°W</div>
      <div style={{ position: "absolute", top: "10px", right: "12px", display: "flex", gap: "6px" }}>
        <SourceBadge source="foursquare" />
        <SourceBadge source="overpass" />
      </div>
    </div>
  );
}

export default function GoodEats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [highlighted, setHighlighted] = useState(null);
  const [feedFilter, setFeedFilter] = useState("all");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/all`);
      if (!resp.ok) throw new Error(`Backend returned ${resp.status}`);
      const body = await resp.json();
      setData(body);
      setUsingMock(false);
    } catch (e) {
      console.warn("Backend unreachable, using mock fallback:", e);
      setData(MOCK_FALLBACK);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() { await load(); }
    init();
  }, []);

  const mapPins = useMemo(() => {
    if (!data) return [];
    const fsq = (data.restaurants?.data || []).map((r) => ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, source: "foursquare" }));
    const osm = (data.places?.data || []).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, source: "overpass" }));
    return [...fsq, ...osm].filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  }, [data]);

  const filteredRestaurants = useMemo(() => {
    if (!data?.restaurants?.data) return [];
    if (!search) return data.restaurants.data;
    const q = search.toLowerCase();
    return data.restaurants.data.filter((r) =>
      (r.name || "").toLowerCase().includes(q) ||
      (r.categories || []).some((c) => (c || "").toLowerCase().includes(q))
    );
  }, [data, search]);

  const filteredPlaces = useMemo(() => {
    if (!data?.places?.data) return [];
    if (!search) return data.places.data;
    const q = search.toLowerCase();
    return data.places.data.filter((p) =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.cuisine || []).some((c) => (c || "").toLowerCase().includes(q))
    );
  }, [data, search]);

  const feedItems = useMemo(() => {
    if (!data) return [];
    const items = [];
    if (feedFilter === "all" || feedFilter === "reddit") {
      (data.reddit?.data || []).forEach((p) => items.push({ kind: "reddit", data: p, sort: p.created_utc * 1000 }));
    }
    if (feedFilter === "all" || feedFilter === "news") {
      (data.news?.data || []).forEach((a) => items.push({ kind: "gnews", data: a, sort: new Date(a.publishedAt).getTime() }));
      (data.articles?.data || []).forEach((a) => items.push({ kind: "guardian", data: a, sort: new Date(a.publishedAt).getTime() }));
    }
    return items.sort((a, b) => (b.sort || 0) - (a.sort || 0));
  }, [data, feedFilter]);

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'Source Sans Pro', -apple-system, sans-serif", color: "#1F2937" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400;600;700&family=Source+Sans+Pro:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        a:hover { text-decoration: underline !important; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <header style={{ borderBottom: "1px solid #1F2937", background: "white", padding: "20px 32px" }}>
        <div style={{ maxWidth: "1400px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "#6B7280", letterSpacing: "0.15em", marginBottom: "4px" }}>VOL. 1 · ISSUE 0.5 · APR 2026</div>
            <h1 style={{ fontFamily: "'Source Serif Pro', Georgia, serif", fontSize: "36px", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>GoodEats<span style={{ color: "#B45309" }}>.</span></h1>
            <div style={{ fontSize: "13px", color: "#4B5563", fontStyle: "italic", marginTop: "2px" }}>A multi-source dining digest for Bothell, Washington</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
            <button onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", background: "white", border: "1px solid #1F2937", fontSize: "11px", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.5 : 1 }}>
              <RefreshCw size={12} strokeWidth={1.8} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              {loading ? "Loading" : "Refresh"}
            </button>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "#6B7280", letterSpacing: "0.1em", textAlign: "right" }}>5 SOURCES · NO ML</div>
          </div>
        </div>
      </header>

      {data && (
        <div style={{ background: "white", borderBottom: "1px solid #E5E7EB", padding: "10px 32px" }}>
          <div style={{ maxWidth: "1400px", margin: "0 auto", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "#6B7280", letterSpacing: "0.1em", marginRight: "4px" }}>STATUS</span>
            <StatusPill ok={data.restaurants?.ok} count={data.restaurants?.count} source="foursquare" />
            <StatusPill ok={data.places?.ok} count={data.places?.count} source="overpass" />
            <StatusPill ok={data.reddit?.ok} count={data.reddit?.count} source="reddit" />
            <StatusPill ok={data.news?.ok} count={data.news?.count} source="gnews" />
            <StatusPill ok={data.articles?.ok} count={data.articles?.count} source="guardian" />
            {usingMock && (
              <span style={{ marginLeft: "auto", fontSize: "11px", color: "#92400E", background: "#FEF3C7", padding: "3px 10px", border: "1px solid #FCD34D", fontFamily: "'JetBrains Mono', monospace" }}>
                ⚠ BACKEND UNREACHABLE · USING MOCK DATA
              </span>
            )}
          </div>
        </div>
      )}

      <main style={{ maxWidth: "1400px", margin: "0 auto", padding: "28px 32px" }}>
        {loading && !data && <div style={{ padding: "80px", textAlign: "center", color: "#6B7280", fontStyle: "italic" }}>Loading data from 5 sources...</div>}

        {data && (
          <>
            <section style={{ marginBottom: "32px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
                <h2 style={{ fontFamily: "'Source Serif Pro', Georgia, serif", fontSize: "22px", fontWeight: 600, margin: 0 }}>
                  <MapIcon size={18} style={{ display: "inline", marginRight: "8px", verticalAlign: "-3px" }} strokeWidth={1.5} />Geographic Overview
                </h2>
                <span style={{ fontSize: "12px", color: "#6B7280", fontFamily: "'JetBrains Mono', monospace" }}>{mapPins.length} VENUES · HOVER PINS OR CARDS</span>
              </div>
              <MapView pins={mapPins} highlighted={highlighted} onPinHover={setHighlighted} onPinLeave={() => setHighlighted(null)} />
            </section>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "32px" }}>
              <section>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", paddingBottom: "12px", borderBottom: "2px solid #1F2937" }}>
                  <h2 style={{ fontFamily: "'Source Serif Pro', Georgia, serif", fontSize: "22px", fontWeight: 600, margin: 0 }}>Restaurants & Places</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      onClick={() => {
                        const pool = [...filteredRestaurants, ...filteredPlaces];
                        if (pool.length === 0) return;
                        const pick = pool[Math.floor(Math.random() * pool.length)];
                        setHighlighted(pick.id);
                      }}
                      disabled={filteredRestaurants.length + filteredPlaces.length === 0}
                      title="Pick a random venue from the visible list"
                      style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", background: "white", border: "1px solid #1F2937", fontSize: "11px", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", color: "#1F2937" }}
                    >
                      <Shuffle size={12} strokeWidth={1.8} />Pick One
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "white", border: "1px solid #E5E7EB", padding: "6px 10px", width: "260px" }}>
                      <Search size={14} color="#6B7280" strokeWidth={1.5} />
                      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name or category..." style={{ border: "none", outline: "none", fontSize: "13px", flex: 1, background: "transparent", fontFamily: "inherit" }} />
                    </div>
                  </div>
                </div>

                {filteredRestaurants.length > 0 && (
                  <>
                    <h3 style={{ fontSize: "12px", color: "#6B7280", letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace", margin: "0 0 12px 0", textTransform: "uppercase" }}>From Foursquare ({filteredRestaurants.length})</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "24px" }}>
                      {filteredRestaurants.map((r) => (
                        <RestaurantCard key={r.id} r={r} onHover={setHighlighted} onLeave={() => setHighlighted(null)} isHighlighted={highlighted === r.id} />
                      ))}
                    </div>
                  </>
                )}

                {filteredPlaces.length > 0 && (
                  <>
                    <h3 style={{ fontSize: "12px", color: "#6B7280", letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace", margin: "0 0 12px 0", textTransform: "uppercase" }}>From OpenStreetMap ({filteredPlaces.length})</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                      {filteredPlaces.map((p) => (
                        <PlaceCard key={p.id} p={p} onHover={setHighlighted} onLeave={() => setHighlighted(null)} isHighlighted={highlighted === p.id} />
                      ))}
                    </div>
                  </>
                )}

                {filteredRestaurants.length === 0 && filteredPlaces.length === 0 && (
                  <div style={{ padding: "40px", textAlign: "center", color: "#6B7280", fontStyle: "italic" }}>No places match your filter.</div>
                )}
              </section>

              <aside>
                <div style={{ paddingBottom: "12px", borderBottom: "2px solid #1F2937", marginBottom: "8px" }}>
                  <h2 style={{ fontFamily: "'Source Serif Pro', Georgia, serif", fontSize: "22px", fontWeight: 600, margin: "0 0 10px 0" }}>The Feed</h2>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {[{ key: "all", label: "All" }, { key: "reddit", label: "Reddit" }, { key: "news", label: "News" }].map((t) => (
                      <button key={t.key} onClick={() => setFeedFilter(t.key)} style={{ padding: "5px 12px", fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", border: feedFilter === t.key ? "1px solid #1F2937" : "1px solid #E5E7EB", background: feedFilter === t.key ? "#1F2937" : "white", color: feedFilter === t.key ? "white" : "#4B5563", cursor: "pointer" }}>{t.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{ background: "white", padding: "0 16px", border: "1px solid #E5E7EB" }}>
                  {feedItems.map((item, i) => {
                    if (item.kind === "reddit") return <RedditPost key={i} post={item.data} />;
                    return <NewsArticle key={i} article={item.data} source={item.kind} />;
                  })}
                  {feedItems.length === 0 && (
                    <div style={{ padding: "40px 0", textAlign: "center", color: "#6B7280", fontStyle: "italic", fontSize: "13px" }}>No items in this filter.</div>
                  )}
                </div>
              </aside>
            </div>
          </>
        )}

        <footer style={{ marginTop: "48px", paddingTop: "20px", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#6B7280", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em" }}>
          <div>GOODEATS · v0.5 · CLASS PROJECT BUILD</div>
          <div>NO ML PROCESSING · RAW API DATA · PHASE 1 OF 3</div>
        </footer>
      </main>
    </div>
  );
}
