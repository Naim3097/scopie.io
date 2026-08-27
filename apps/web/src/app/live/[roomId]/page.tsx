"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { LiveRoom, Product } from "@scopie/core";
import { apiGet, apiPost } from "@/lib/api";
import { DEMO_LIVE_HLS, demoProducts, demoRooms, formatRM } from "@/lib/demo";
import { MOBILE_HLS_CONFIG, applyLevelCap } from "@/lib/hls-config";
import { track } from "@/lib/events";

interface ChatMsg {
  from: string;
  text: string;
  isHost?: boolean;
}

/**
 * Live room viewer — currently plays the demo HLS loop. The LiveKit web
 * player (POST /v1/live/token → join room, pins via data messages) is NOT
 * wired yet; when it lands, the demo path below becomes its fallback.
 * Production sync rule stands: pins/deals ride stream position, never wall
 * clock (HLS viewers lag 3–6 s).
 */
export default function LiveRoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [room, setRoom] = useState<LiveRoom | null | "not_found">(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { from: "Nurul", text: "Love this bag! 😍" },
    { from: "Aiman", text: "How much is the bag?" },
    { from: "Scopie", text: "It's RM 189.00 — and there's 10% off today only ✨", isHost: true },
  ]);
  const [draft, setDraft] = useState("");
  const [dealLeft, setDealLeft] = useState<number | null>(null);
  const [muted, setMuted] = useState(true);
  const [needsTap, setNeedsTap] = useState(false);
  const chatlogRef = useRef<HTMLDivElement>(null);

  /** In-gesture unmute — mobile browsers only honor audio started from a tap. */
  const toggleMute = () => {
    const el = videoRef.current;
    const next = !muted;
    if (el) {
      el.muted = next;
      if (!next && el.paused) void el.play().catch(() => undefined);
    }
    setMuted(next);
  };

  const tapToPlay = () => {
    setNeedsTap(false);
    const el = videoRef.current;
    if (el) void el.play().catch(() => setNeedsTap(true));
  };

  // New messages must be visible — a 200px scroller with appends below the
  // fold reads as a dead chat on a phone.
  useEffect(() => {
    const log = chatlogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length]);

  const pinned: Product | undefined = useMemo(
    () =>
      room && room !== "not_found" ? demoProducts.find((p) => p.id === room.pinnedProductId) : undefined,
    [room],
  );

  useEffect(() => {
    void apiGet<LiveRoom | null>(
      `/v1/live/rooms/${roomId}`,
      demoRooms.find((r) => r.id === roomId) ?? null,
    ).then((r) => {
      setRoom(r ?? "not_found");
      // Deal countdown seeds from the room's own deal window, not a constant.
      if (r?.flashDeal) setDealLeft(Math.max(0, Math.floor(r.flashDeal.endsAtStreamMs / 1000)));
    });
    track({ type: "live.join", subjectId: roomId, surface: "live" });
    return () => track({ type: "live.leave", subjectId: roomId, surface: "live" });
  }, [roomId]);

  // Demo playback. play() only after a source is attached; autoplay denial
  // surfaces a tap-to-play overlay instead of a silent black stage.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || room === "not_found") return;
    let cancelled = false;
    let hls: { destroy: () => void } | null = null;
    const tryPlay = () => {
      if (cancelled || !el.paused) return;
      el.play()
        .then(() => setNeedsTap(false))
        .catch((err: DOMException) => {
          if (err?.name === "NotAllowedError") setNeedsTap(true);
        });
    };
    el.addEventListener("canplay", tryPlay);
    if (el.canPlayType("application/vnd.apple.mpegurl") !== "") {
      el.src = DEMO_LIVE_HLS;
    } else {
      import("hls.js")
        .then(({ default: Hls }) => {
          if (cancelled || !Hls.isSupported()) return;
          const h = new Hls({ ...MOBILE_HLS_CONFIG });
          h.loadSource(DEMO_LIVE_HLS);
          h.attachMedia(el);
          h.on(Hls.Events.MANIFEST_PARSED, () => {
            applyLevelCap(h);
            tryPlay();
          });
          h.on(Hls.Events.ERROR, (_evt, data) => {
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) h.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
          });
          hls = h;
        })
        .catch(() => {
          if (!cancelled) setNeedsTap(true);
        });
    }
    return () => {
      cancelled = true;
      el.removeEventListener("canplay", tryPlay);
      hls?.destroy();
    };
  }, [room]);

  // Deal countdown ticks to zero and then reads "ended" — never a frozen
  // 00:00:00 that still looks claimable.
  useEffect(() => {
    if (dealLeft === null) return;
    const t = setInterval(() => setDealLeft((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [dealLeft !== null]);

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

  if (room === "not_found") {
    return (
      <main className="page page--pad" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 48 }}>📺</div>
        <h1 className="page-title">This live has ended</h1>
        <p className="page-sub">The stream you're looking for isn't running any more.</p>
        <Link href="/live" className="btn btn-ghost">
          See who's live now
        </Link>
      </main>
    );
  }

  const dealActive = Boolean(room?.flashDeal) && dealLeft !== null && dealLeft > 0;
  const hh = Math.floor((dealLeft ?? 0) / 3600);
  const mm = Math.floor(((dealLeft ?? 0) % 3600) / 60);
  const ss = (dealLeft ?? 0) % 60;

  return (
    <main className="page page--pad">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>{room ? room.title : "Scopie Live"}</h1>
          {room?.hostType === "ai" && (
            <span className="ai-badge" title="This host is an AI avatar">
              ✦ AI Host — always disclosed
            </span>
          )}
        </div>
        <span className="live-badge">● LIVE</span>
      </div>

      <div className="live-stage">
        <video ref={videoRef} playsInline muted={muted} loop poster="/posters/poster-a.png" />
        <button className="live-mute" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? "🔇" : "🔊"}
        </button>
        {needsTap && (
          <button className="tap-to-play" onClick={tapToPlay} aria-label="Play stream">
            ▶
          </button>
        )}
        {pinned && (
          <div className="live-pin">
            {pinned.imageUrl && <img src={pinned.imageUrl} alt="" />}
            <div className="grow">
              <b>{pinned.title}</b>
              <span style={{ fontSize: 13 }}>{formatRM(pinned.priceSen)}</span>
              {room?.flashDeal && (
                <div className="deal">
                  {dealActive
                    ? `${room.flashDeal.discountPct}% OFF · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
                    : "Deal ended"}
                </div>
              )}
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "auto", padding: "9px 14px", fontSize: 13.5 }}
              onClick={() => track({ type: "live.pin_tap", subjectId: pinned.id, surface: "live" })}
              aria-label={`Add ${pinned.title}`}
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
