"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Video } from "@scopie/core";
import { HelmetMark } from "@/components/Brand";
import { Hero } from "@/components/Glyph";
import { apiGet, DEMO_MODE } from "@/lib/api";
import { demoSellers, demoVideos } from "@/lib/demo";
import { aiHostOf, hostAria } from "@/lib/hosts";
import { isFollowing, toggleFollow } from "@/lib/social";

const compact = Intl.NumberFormat("en-MY", { notation: "compact" });

/**
 * Creator profile: their clips, their numbers, a follow. Follows live on
 * this device until accounts own the social graph.
 */
export default function CreatorPage() {
  const params = useParams<{ handle: string }>();
  // A lone "%" in the address bar is legal — a malformed escape must not 500.
  const handle = (() => {
    try {
      return decodeURIComponent(params.handle ?? "");
    } catch {
      return params.handle ?? "";
    }
  })();
  // Demo clips resolve synchronously — no spinner frame on the demo site.
  const [videos, setVideos] = useState<Video[]>(() =>
    DEMO_MODE ? demoVideos.filter((v) => v.creatorId === handle) : [],
  );
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    setFollowing(isFollowing(handle));
    if (DEMO_MODE) {
      setVideos(demoVideos.filter((v) => v.creatorId === handle));
      return;
    }
    setLoading(true);
    // limit=50 (the API max): the default 10 would hide lower-ranked clips
    // and fake an empty profile for real creators.
    void apiGet<Video[]>("/v1/feed?limit=50", demoVideos).then((feed) => {
      const source = feed.length > 0 ? feed : demoVideos;
      setVideos(source.filter((v) => v.creatorId === handle));
      setLoading(false);
    });
  }, [handle]);

  const likeTotal = useMemo(() => videos.reduce((n, v) => n + (v.stats.likes ?? 0), 0), [videos]);
  // Illustrative until the social backend: stable per-creator follower base.
  const followerBase = useMemo(() => {
    let h = 0;
    for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) >>> 0;
    return 800 + (h % 9200);
  }, [handle]);

  if (!loading && videos.length === 0) {
    return (
      <main className="page page--pad" style={{ textAlign: "center", paddingTop: 80 }}>
        <Hero kind="user" />
        <h1 className="page-title">@{handle}</h1>
        <p className="page-sub">This creator hasn&rsquo;t posted yet — check back soon.</p>
        <Link href="/" className="btn btn-primary" style={{ width: "auto" }}>
          Back to the feed
        </Link>
      </main>
    );
  }

  return (
    <main className="page page--pad">
      <div className="creator-head">
        <div className="avatar-orb" style={{ margin: 0 }} aria-hidden="true">
          {([...handle][0] ?? "S").toUpperCase()}
        </div>
        <div className="grow">
          <h1 style={{ fontSize: 22, overflowWrap: "anywhere" }}>
            {demoSellers[handle]?.name ?? `@${handle}`}
          </h1>
          <div style={{ color: "var(--muted)", fontSize: 13.5 }}>
            {compact.format(followerBase + (following ? 1 : 0))} followers · {compact.format(likeTotal)} likes
          </div>
          {/* A business account fronts its own named AI host: <business>.ai */}
          {demoSellers[handle] && (
            <span className="scopie-chip scopie-chip--ink" style={{ marginTop: 6 }} aria-label={hostAria(aiHostOf(handle))}>
              <HelmetMark size={15} />
              {aiHostOf(handle)}
            </span>
          )}
        </div>
        <button
          className={following ? "btn btn-ghost" : "btn btn-primary"}
          style={{ width: "auto", padding: "10px 18px" }}
          aria-pressed={following}
          onClick={() => setFollowing(toggleFollow(handle))}
        >
          {following ? "Following" : "Follow"}
        </button>
      </div>

      <div className="sec-label" style={{ marginTop: 20 }}>
        Clips
      </div>
      {loading ? (
        <div className="buffering" style={{ position: "static", padding: "30px 0" }} role="status" aria-label="Loading clips">
          <div className="ring ring--ink"></div>
        </div>
      ) : (
        <div className="creator-grid">
          {videos.map((v) => (
            <Link key={v.id} href={`/?v=${encodeURIComponent(v.id)}`} className="creator-tile" aria-label={`Play: ${v.caption || "video"}`}>
              {v.posterUrl && <img src={v.posterUrl} alt="" />}
              <span className="creator-tile-meta">
                {compact.format(v.stats.likes ?? 0)} likes
              </span>
            </Link>
          ))}
        </div>
      )}
      <p className="section-note">Follows live on this device for now — they sync when accounts launch.</p>
    </main>
  );
}
