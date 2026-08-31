"use client";

import { useEffect, useState } from "react";
import type { LiveRoom, Product, Video } from "@scopie/core";
import { HelmetMark, Wordmark } from "@/components/Brand";
import { CartButton } from "@/components/commerce/Commerce";
import { VideoFeed, type FeedEntry } from "@/components/feed/VideoFeed";
import { apiGet, DEMO_MODE } from "@/lib/api";
import { demoProducts, demoRooms, demoVideos } from "@/lib/demo";
import { AskScopie } from "./AskScopie";
import { CreatePanel } from "./CreatePanel";
import { Panel } from "./Panel";
import { ProfilePanel } from "./ProfilePanel";
import { SearchPanel } from "./SearchPanel";
import { SurfaceDock, type PanelKind } from "./SurfaceDock";
import { WelcomeGate } from "./WelcomeGate";

// Real content frames, not abstract art — a live card must look alive.
const LIVE_POSTERS = ["/videos/posters/kalima-ai-model.jpg", "/videos/posters/hoor-ugc-1.jpg"];
/** Live cards ride the feed at these positions (after clip 3, then deeper). */
const LIVE_SLOTS = [3, 9];

function weave(videos: Video[], rooms: LiveRoom[]): FeedEntry[] {
  const entries: FeedEntry[] = videos.map((video) => ({ kind: "video", video }));
  rooms
    .filter((r) => r.status === "live")
    .slice(0, LIVE_SLOTS.length)
    .forEach((room, i) => {
      const at = Math.min(LIVE_SLOTS[i]!, entries.length);
      entries.splice(at, 0, { kind: "live", room, poster: LIVE_POSTERS[i % LIVE_POSTERS.length]! });
    });
  return entries;
}

/**
 * THE surface. Scopie is one screen: the feed (clips + live rooms woven in),
 * with every other experience — search, create, ask-scopie, bag, profile —
 * as an overlay on top of it. Nothing here navigates away except real
 * documents (live rooms, seller tools, auth, payment returns).
 */
export function Surface() {
  // Demo data seeds synchronously — the surface must paint content on frame
  // one. Local posts and any real API still merge in the effect below.
  const [videos, setVideos] = useState<Video[]>(() => (DEMO_MODE ? demoVideos : []));
  const [rooms, setRooms] = useState<LiveRoom[]>(() => (DEMO_MODE ? demoRooms : []));
  const [products, setProducts] = useState<Record<string, Product>>(() =>
    DEMO_MODE ? Object.fromEntries(demoProducts.map((p) => [p.id, p])) : {},
  );

  // ?v=<id> deep link, else the last watched card (VideoFeed persists it) —
  // read synchronously so the first render already targets the right card.
  const [initialVideoId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return (
        new URLSearchParams(window.location.search).get("v") ??
        sessionStorage.getItem("scopie_feed_at")
      );
    } catch {
      return null;
    }
  });

  // ?panel= (from old-route redirects) opens straight into an overlay;
  // ?q= seeds the ask thread. Read once, synchronously.
  const [panel, setPanel] = useState<PanelKind | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const p = new URLSearchParams(window.location.search).get("panel");
      return p === "search" || p === "create" || p === "ask" || p === "profile" ? p : null;
    } catch {
      return null;
    }
  });
  const [askSeed, setAskSeed] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return new URLSearchParams(window.location.search).get("q");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    void (async () => {
      const [feed, picks, liveRooms] = await Promise.all([
        apiGet<Video[]>("/v1/feed", demoVideos),
        apiGet<Product[]>("/v1/products/picks?limit=20", demoProducts),
        apiGet<LiveRoom[]>("/v1/live/rooms", demoRooms),
      ]);
      // The server owns cold-start behavior (it returns stripped demo videos
      // for a configured-but-empty store); the client only guards the pure
      // network-failure case its apiGet fallback already covers.
      let merged = feed.length > 0 ? feed : demoVideos;
      // Pure-demo site ONLY: locally "created" posts lead the feed. Never
      // against a real API — stale local entries must not sit atop real
      // content.
      if (DEMO_MODE) {
        try {
          const raw = JSON.parse(localStorage.getItem("scopie_demo_myvideos") ?? "[]") as unknown;
          const mine = Array.isArray(raw) ? raw : [];
          if (mine.length > 0) {
            const local: Video[] = mine.slice(0, 3).map((m, i) => ({
              id: `local_${Number((m as { at?: unknown })?.at) || i}_${i}`,
              creatorId: "you",
              caption: String((m as { caption?: unknown })?.caption ?? ""),
              hlsUrl: demoVideos[0]!.hlsUrl,
              posterUrl: "/posters/poster-a.png",
              hashtags: ["MyFirstScopie"],
              productIds: [],
              stats: { likes: 0, comments: 0, shares: 0 },
            }));
            merged = [...local, ...merged];
          }
        } catch {
          /* localStorage unavailable/corrupt — skip */
        }
      }
      setVideos(merged);
      setRooms(liveRooms.length > 0 ? liveRooms : demoRooms);
      // Trust the API's product list as returned: a configured store that
      // answers 200 [] stays empty (demo products must not resurrect).
      const productList = DEMO_MODE || picks.length > 0 ? (picks.length > 0 ? picks : demoProducts) : picks;
      setProducts(Object.fromEntries(productList.map((p) => [p.id, p])));
    })();
  }, []);

  const entries = weave(videos, rooms);
  const openAsk = (query?: string) => {
    setAskSeed(query ?? null);
    setPanel("ask");
  };

  return (
    <>
      <main className="page page--feed" style={{ position: "relative" }}>
        <h1 className="sr-only">Scopie</h1>
        {/* The surface IS home — the lockup is presence, not navigation. */}
        <span className="feed-brand" aria-hidden="true">
          <span className="brand-visual">
            <HelmetMark size={27} fill="#ffffff" />
            <Wordmark color="#ffffff" />
          </span>
        </span>
        {entries.length > 0 ? (
          <VideoFeed entries={entries} products={products} initialVideoId={initialVideoId} />
        ) : (
          <div className="page--pad">
            {/* light-token .page-sub would vanish on the dark feed ground */}
            <p role="status" style={{ paddingTop: 40, color: "rgba(255, 255, 255, 0.78)", fontSize: 14.5 }}>
              Loading your feed…
            </p>
          </div>
        )}
      </main>

      <SurfaceDock onOpen={setPanel} />

      {panel && (
        <Panel
          title={
            panel === "ask" ? "Ask Scopie" : panel === "search" ? "Discover" : panel === "create" ? "Create" : "Scopay"
          }
          right={panel === "search" ? <CartButton /> : undefined}
          onClose={() => setPanel(null)}
        >
          {panel === "ask" && <AskScopie initialQuery={askSeed} />}
          {panel === "search" && <SearchPanel onAsk={openAsk} />}
          {panel === "create" && <CreatePanel onDone={() => setPanel(null)} />}
          {panel === "profile" && <ProfilePanel />}
        </Panel>
      )}

      <WelcomeGate onEnter={setPanel} />
    </>
  );
}
