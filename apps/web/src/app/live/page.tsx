"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LiveRoom } from "@scopie/core";
import { apiGet } from "@/lib/api";
import { demoRooms } from "@/lib/demo";

const THUMBS = ["/posters/poster-a.png", "/posters/poster-b.png"];

export default function LiveListPage() {
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiGet<LiveRoom[]>("/v1/live/rooms", demoRooms).then((r) => {
      setRooms(r.length > 0 ? r : demoRooms);
      setLoading(false);
    });
  }, []);

  return (
    <main className="page page--pad">
      <div className="sec-label" style={{ marginTop: 14 }}>
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
