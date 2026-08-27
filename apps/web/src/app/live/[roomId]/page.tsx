"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { LiveRoom, Product } from "@scopie/core";
import { apiGet, apiPost } from "@/lib/api";
import { DEMO_LIVE_HLS, demoProducts, demoRooms, formatRM } from "@/lib/demo";
import { track } from "@/lib/events";

interface ChatMsg {
  from: string;
  text: string;
  isHost?: boolean;
}

/**
 * Live room viewer.
 * Real mode: POST /v1/live/token → join the LiveKit room (subscribe-only),
 * pinned products and deals arrive as data messages synced to stream position.
 * Demo mode (no LiveKit configured): loops an HLS stream and scripts the AI
 * host's replies so the full UX is reviewable without infrastructure.
 */
export default function LiveRoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [room, setRoom] = useState<LiveRoom | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { from: "Nurul", text: "Love this bag! 😍" },
    { from: "Aiman", text: "How much is the bag?" },
    { from: "Scopie", text: "It's RM 189.00 — and there's 10% off today only ✨", isHost: true },
  ]);
  const [draft, setDraft] = useState("");
  const [dealLeft, setDealLeft] = useState(2 * 60 * 60);
  const chatlogRef = useRef<HTMLDivElement>(null);

  // New messages must be visible — a 200px scroller with appends below the
  // fold reads as a dead chat on a phone.
  useEffect(() => {
    const log = chatlogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length]);

  const pinned: Product | undefined = useMemo(
    () => demoProducts.find((p) => p.id === room?.pinnedProductId),
    [room?.pinnedProductId],
  );

  useEffect(() => {
    void apiGet<LiveRoom | null>(`/v1/live/rooms/${roomId}`, demoRooms.find((r) => r.id === roomId) ?? demoRooms[0] ?? null).then(
      setRoom,
    );
    track({ type: "live.join", subjectId: roomId, surface: "live" });
    return () => track({ type: "live.leave", subjectId: roomId, surface: "live" });
  }, [roomId]);

  // Demo playback (LiveKit path activates when the token endpoint returns
  // real credentials). play() must only fire AFTER a source is attached —
  // on the hls.js path that means MANIFEST_PARSED, never synchronously.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    let cancelled = false;
    let hls: { destroy: () => void } | null = null;
    const tryPlay = () => {
      if (!cancelled && el.paused) void el.play().catch(() => undefined);
    };
    // Retry on the element's own readiness too — a play() started just
    // before an effect re-run (React StrictMode) can be interrupted, and
    // 'canplay' fires again once the final attach settles.
    el.addEventListener("canplay", tryPlay);
    if (el.canPlayType("application/vnd.apple.mpegurl") !== "") {
      el.src = DEMO_LIVE_HLS;
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) return;
        const h = new Hls();
        h.loadSource(DEMO_LIVE_HLS);
        h.attachMedia(el);
        h.on(Hls.Events.MANIFEST_PARSED, tryPlay);
        h.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) h.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
        });
        hls = h;
      });
    }
    return () => {
      cancelled = true;
      el.removeEventListener("canplay", tryPlay);
      hls?.destroy();
    };
  }, []);

  // Flash-deal countdown. Production syncs this to stream position via timed
  // metadata (HLS viewers lag 3–6 s) — never wall clock.
  useEffect(() => {
    const t = setInterval(() => setDealLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setMessages((m) => [...m, { from: "You", text }]);
    track({ type: "live.chat", subjectId: roomId, surface: "live" });
    // Demo: scripted host reply. Production: chat goes to the question ranker;
    // the avatar answers selected questions on-stream.
    const { reply } = await apiPost<{ reply: string }>(
      "/v1/agents/shopper",
      { buyerId: "demo-buyer", message: text },
      { reply: "Sure! Let me show you another colour ✨" },
    );
    setTimeout(() => setMessages((m) => [...m, { from: "Scopie", text: reply, isHost: true }]), 900);
  };

  const hh = Math.floor(dealLeft / 3600);
  const mm = Math.floor((dealLeft % 3600) / 60);
  const ss = dealLeft % 60;

  return (
    <main className="page page--pad">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>{room?.title ?? "Scopie Live"}</h1>
          {room?.hostType === "ai" && (
            <span className="ai-badge" title="This host is an AI avatar">
              ✦ AI Host — always disclosed
            </span>
          )}
        </div>
        <span className="live-badge">● LIVE</span>
      </div>

      <div className="live-stage">
        <video ref={videoRef} playsInline muted loop />
        {pinned && (
          <div className="live-pin">
            {pinned.imageUrl && <img src={pinned.imageUrl} alt="" />}
            <div className="grow">
              <b>{pinned.title}</b>
              <span style={{ fontSize: 13 }}>{formatRM(pinned.priceSen)}</span>
              {room?.flashDeal && (
                <div className="deal">
                  {room.flashDeal.discountPct}% OFF · {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}:
                  {String(ss).padStart(2, "0")}
                </div>
              )}
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "auto", padding: "9px 14px", fontSize: 13.5 }}
              onClick={() => track({ type: "live.pin_tap", subjectId: pinned.id, surface: "live" })}
            >
              +
            </button>
          </div>
        )}
      </div>

      <div className="chatlog" aria-live="polite" ref={chatlogRef}>
        {messages.map((m, i) => (
          <div key={i} className="chatmsg">
            <b>{m.isHost ? "✦ Scopie" : m.from}</b> {m.text}
          </div>
        ))}
      </div>
      <div className="chatrow">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter during IME composition (pinyin/Jawi input) commits the
            // candidate, it doesn't send.
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") void send();
          }}
          placeholder="Say something…"
          aria-label="Chat message"
        />
        <button className="btn btn-ghost" onClick={() => void send()}>
          Send
        </button>
      </div>
    </main>
  );
}
