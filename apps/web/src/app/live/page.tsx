"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LiveRoom } from "@scopie/core";
import { BrandLink } from "@/components/Brand";
import { CartButton } from "@/components/commerce/Commerce";
import { apiGet, DEMO_MODE } from "@/lib/api";
import { demoRooms } from "@/lib/demo";

const THUMBS = ["/posters/poster-a.png", "/posters/poster-b.png"];

export default function LiveListPage() {
  // Demo data is synchronous — seeding it at first render means no loader
  // frame ever paints on the demo site.
  const [rooms, setRooms] = useState<LiveRoom[]>(() => (DEMO_MODE ? demoRooms : []));
  const [loading, setLoading] = useState(!DEMO_MODE);

  useEffect(() => {
    if (DEMO_MODE) return;
    void apiGet<LiveRoom[]>("/v1/live/rooms", demoRooms).then((r) => {
      setRooms(r.length > 0 ? r : demoRooms);
      setLoading(false);
    });
  }, []);

  return (
    <main className="page page--pad">
      <div className="topbar" style={{ padding: 0 }}>
        <BrandLink />
        <CartButton />
      </div>
      <div className="sec-label" style={{ marginTop: 8 }}>
        LIVE SHOPPING
      </div>
      <h1 className="page-title" style={{ marginTop: 2 }}>
        Live now
      </h1>
      <p className="page-sub">Shop together, in real time.</p>
      {loading && (
        <div className="buffering" style={{ position: "static", padding: "30px 0" }} role="status" aria-label="Loading live rooms">
          <div className="ring" style={{ borderTopColor: "var(--accent)", borderColor: "var(--line-strong)" }}></div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rooms.map((room, i) => (
          <Link key={room.id} href={`/live/${room.id}`} className="live-tile">
            <span className="live-thumb">
              <img src={THUMBS[i % THUMBS.length]} alt="" />
              <span className="live-badge live-badge--sm">
                <span aria-hidden="true">●</span> LIVE
              </span>
            </span>
            <span className="grow">
              <b>{room.title}</b>
              {room.hostType === "ai" && (
                <span className="ai-badge" style={{ marginBottom: 4 }}>
                  <span aria-hidden="true">✦</span> AI Host
                </span>
              )}
              <span className="sub" style={{ display: "block" }}>
                {Intl.NumberFormat("en-MY", { notation: "compact" }).format(room.viewerCount)} watching
              </span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
