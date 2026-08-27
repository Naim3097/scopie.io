"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LiveRoom } from "@scopie/core";
import { apiGet } from "@/lib/api";
import { demoRooms } from "@/lib/demo";

export default function LiveListPage() {
  const [rooms, setRooms] = useState<LiveRoom[]>([]);

  useEffect(() => {
    void apiGet<LiveRoom[]>("/v1/live/rooms", demoRooms).then((r) => setRooms(r.length > 0 ? r : demoRooms));
  }, []);

  return (
    <main className="page page--pad">
      <h1 className="page-title">Live now</h1>
      <p className="page-sub">Shop together, in real time.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rooms.map((room) => (
          <Link key={room.id} href={`/live/${room.id}`} className="card" style={{ padding: "14px 16px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span className="live-badge">● LIVE</span>
              {room.hostType === "ai" && <span className="ai-badge">✦ AI Host</span>}
            </div>
            <div style={{ fontWeight: 600 }}>{room.title}</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              {Intl.NumberFormat("en-MY", { notation: "compact" }).format(room.viewerCount)} watching
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
