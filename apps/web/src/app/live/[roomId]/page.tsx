"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { LiveRoom, Product } from "@scopie/core";
import { API_BASE, DEMO_MODE, apiGet, apiPost } from "@/lib/api";
import { getAuthHeaders } from "@/lib/supabase";
import { DEMO_LIVE_HLS, demoHostReply, demoProducts, demoRooms, formatRM } from "@/lib/demo";
import { MOBILE_HLS_CONFIG, applyLevelCap } from "@/lib/hls-config";
import { connectViewer, type ViewerConnection } from "@/lib/live";
import { useCommerce } from "@/components/commerce/Commerce";
import { Hero, StrokeIcon } from "@/components/Glyph";
import { track } from "@/lib/events";

interface ChatMsg {
  id?: string;
  from: string;
  text: string;
  isHost?: boolean;
  isSystem?: boolean;
  product?: { id: string; title: string; priceSen: number } | null;
}

type RoomView = LiveRoom & { pinnedProduct?: Product | null };
type PlaybackMode = "pending" | "hls" | "livekit";

/** How long a connected LiveKit room may stay video-less before we fall back to the sample loop. */
const NO_VIDEO_FALLBACK_MS = 12_000;
/** While a live room plays the fallback, retry the real connection this often (via the 10 s poll). */
const LIVEKIT_RETRY_MS = 30_000;

// Scripted chat is demo-theater — a real room must start with a real (empty) log.
const DEMO_CHAT: ChatMsg[] = [
  { from: "Nurul", text: "Love this bag! 😍" },
  { from: "Aiman", text: "How much is the bag?" },
  { from: "Scopie", text: "It's RM 189.00 — and there's 10% off today only ✨", isHost: true },
];

/**
 * Live room viewer. Real mode: viewer token → LiveKit room (subscribe-only),
 * with room state (pin/deal/status) polled every 10 s. Demo mode (or any
 * connect failure): the HLS demo loop — clearly labeled as a sample when the
 * room itself is real, and retried while the room stays live.
 */
export default function LiveRoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const videoRef = useRef<HTMLVideoElement>(null);
  const lkRef = useRef<ViewerConnection | null>(null);
  const mutedRef = useRef(true);
  const modeRef = useRef<PlaybackMode>("pending");
  const lastAttemptRef = useRef(0);
  // The active connect run's cancellation token — the ended-room teardown
  // must be able to cancel an in-flight connect, not just unmount cleanup.
  const cancelTokenRef = useRef<{ cancelled: boolean } | null>(null);
  const [room, setRoom] = useState<RoomView | null | "not_found">(null);
  const [mode, setMode] = useState<PlaybackMode>("pending");
  const [connectAttempt, setConnectAttempt] = useState(0);
  const [messages, setMessages] = useState<ChatMsg[]>(DEMO_MODE ? DEMO_CHAT : []);
  const [draft, setDraft] = useState("");
  const [dealLeft, setDealLeft] = useState<number | null>(null);
  const [muted, setMuted] = useState(true);
  const [needsTap, setNeedsTap] = useState(false);
  const chatlogRef = useRef<HTMLDivElement>(null);
  const lastChatIdRef = useRef("0");
  const demoReplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { openProduct } = useCommerce();

  const roomGone = room === "not_found" || (room !== null && room.status === "ended");
  const polling = !DEMO_MODE && room !== null && room !== "not_found" && room.status !== "ended";
  const isLive = room !== null && room !== "not_found" && room.status === "live";

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // App Router reuses this component across /live/A -> /live/B — chat state
  // must not leak between rooms (a stale cursor would mute the new room, and
  // a pending demo reply would land in the wrong chat).
  useEffect(() => {
    if (demoReplyTimerRef.current) clearTimeout(demoReplyTimerRef.current);
    setMessages(DEMO_MODE ? DEMO_CHAT : []);
    lastChatIdRef.current = "0";
    setDealLeft(null);
    setRoom(null);
    setMode("pending");
    return () => {
      if (demoReplyTimerRef.current) clearTimeout(demoReplyTimerRef.current);
    };
  }, [roomId]);

  /** In-gesture unmute — mobile browsers only honor audio started from a tap. */
  const toggleMute = () => {
    const el = videoRef.current;
    const next = !muted;
    mutedRef.current = next;
    if (el) {
      el.muted = next;
      if (!next && el.paused) void el.play().catch(() => undefined);
    }
    // LiveKit audio rides in hidden elements — the mute button must drive them too.
    lkRef.current?.setMuted(next);
    setMuted(next);
  };

  const tapToPlay = () => {
    setNeedsTap(false);
    const el = videoRef.current;
    if (el) void el.play().catch(() => setNeedsTap(true));
    lkRef.current?.setMuted(mutedRef.current);
  };

  useEffect(() => {
    const log = chatlogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length]);

  // Join/leave analytics once per room visit — connect retries must not re-fire them.
  useEffect(() => {
    track({ type: "live.join", subjectId: roomId, surface: "live" });
    return () => track({ type: "live.leave", subjectId: roomId, surface: "live" });
  }, [roomId]);

  // In real mode the server resolves the pinned product; the local demo
  // catalog is only consulted on the pure-demo site.
  const pinned: Product | null | undefined = useMemo(() => {
    if (!room || room === "not_found") return undefined;
    if (room.pinnedProduct !== undefined) return room.pinnedProduct;
    if (DEMO_MODE) return demoProducts.find((p) => p.id === room.pinnedProductId) ?? null;
    return null;
  }, [room]);

  // Load room + decide playback mode. Re-runs when the poll requests a
  // LiveKit retry (connectAttempt) — e.g. the seller's video arrived late.
  useEffect(() => {
    const token = { cancelled: false };
    cancelTokenRef.current = token;
    let gotVideo = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    void (async () => {
      let view: RoomView | null = null;
      if (DEMO_MODE) {
        view = (demoRooms.find((r) => r.id === roomId) as RoomView | undefined) ?? null;
        if (token.cancelled) return;
        setRoom(view ?? "not_found");
      } else {
        // Only a real 404 means "this live has ended" — a network blip on a
        // flaky connection must retry, never mint a false terminal screen.
        try {
          const res = await fetch(`${API_BASE}/v1/live/rooms/${roomId}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(4000),
          });
          if (token.cancelled) return;
          if (res.status === 404) {
            setRoom("not_found");
            return;
          }
          if (!res.ok) throw new Error(`room load ${res.status}`);
          view = (await res.json()) as RoomView;
          setRoom(view);
        } catch {
          if (token.cancelled) return;
          retryTimer = setTimeout(() => {
            if (!token.cancelled) setConnectAttempt((n) => n + 1);
          }, 5000);
          return;
        }
      }
      if (!view) return;
      if (view.flashDeal) setDealLeft(Math.max(0, Math.floor(view.flashDeal.endsAtStreamMs / 1000)));
      if (view.status !== "live") return;

      if (DEMO_MODE) {
        setMode("hls");
        return;
      }
      lastAttemptRef.current = Date.now();
      const tok = await apiPost<{ demo: boolean; token: string | null; url: string | null }>(
        "/v1/live/token",
        { roomId },
        { demo: true, token: null, url: null },
      );
      if (token.cancelled) return;
      if (tok.demo || !tok.token || !tok.url) {
        setMode("hls");
        return;
      }
      const el = videoRef.current;
      if (!el) return;
      try {
        // Local first, THEN the cancelled check, THEN the shared ref — a
        // stale run resolving late must never clobber the active connection.
        const conn = await connectViewer(tok.url, tok.token, el, {
          muted: mutedRef.current,
          onVideoTrack: () => {
            gotVideo = true;
            if (watchdog) clearTimeout(watchdog);
          },
        });
        if (token.cancelled) {
          conn.disconnect();
          return;
        }
        lkRef.current = conn;
        // Re-sync a mute toggle made while the connection was pending.
        conn.setMuted(mutedRef.current);
        setMode("livekit");
        void el.play().catch((err: DOMException) => {
          if (err?.name === "NotAllowedError") setNeedsTap(true);
        });
        // A connected room with no publisher video (orphaned/idle room) must
        // not freeze the viewer on a poster — fall back to the labeled sample.
        watchdog = setTimeout(() => {
          if (!gotVideo && !token.cancelled) {
            conn.disconnect();
            if (lkRef.current === conn) lkRef.current = null;
            setMode("hls");
          }
        }, NO_VIDEO_FALLBACK_MS);
      } catch {
        // A failed WebRTC connect must never leave a black stage.
        if (!token.cancelled) setMode("hls");
      }
    })();
    return () => {
      token.cancelled = true;
      if (watchdog) clearTimeout(watchdog);
      if (retryTimer) clearTimeout(retryTimer);
      lkRef.current?.disconnect();
      lkRef.current = null;
    };
  }, [roomId, connectAttempt]);

  // Real mode: poll room state (pins, deals, status) every 10 s until the
  // room is gone. While a live room sits on the fallback, request a LiveKit
  // retry — early viewers must not be stuck on the sample after video arrives.
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(`${API_BASE}/v1/live/rooms/${roomId}`, {
            headers: await getAuthHeaders(),
            signal: AbortSignal.timeout(4000),
          });
          if (res.ok) {
            const view = (await res.json()) as RoomView;
            setRoom(view);
            if (
              view.status === "live" &&
              (modeRef.current === "hls" || modeRef.current === "pending") &&
              Date.now() - lastAttemptRef.current > LIVEKIT_RETRY_MS
            ) {
              setConnectAttempt((n) => n + 1);
            }
          } else if (res.status === 404) {
            setRoom("not_found"); // ended demo rooms are deleted server-side
          }
        } catch {
          /* keep last known state */
        }
      })();
    }, 10_000);
    return () => clearInterval(t);
  }, [roomId, polling]);

  // Real mode: room chat lives on the server (it's how the AI host answers
  // and how viewers see each other). Fetch new messages every 5 s while live.
  useEffect(() => {
    if (DEMO_MODE || !isLive) return;
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/live/rooms/${roomId}/chat?since=${lastChatIdRef.current}`, {
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok || cancelled) return;
        const { messages: fresh } = (await res.json()) as { messages: ChatMsg[] };
        if (fresh.length === 0) return;
        lastChatIdRef.current = fresh[fresh.length - 1]!.id ?? lastChatIdRef.current;
        setMessages((m) => {
          const seen = new Set(m.map((x) => x.id).filter(Boolean));
          // cap the log: an hours-long stream must not grow the DOM forever
          return [...m, ...fresh.filter((f) => !seen.has(f.id))].slice(-200);
        });
      } catch {
        /* next tick retries */
      }
    };
    void pull();
    const t = setInterval(() => void pull(), 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [roomId, isLive]);

  // The ended screen must actually stop everything: the in-flight or live
  // LiveKit connection, hidden audio, HLS segment loading, and the poll.
  useEffect(() => {
    if (!roomGone) return;
    if (cancelTokenRef.current) cancelTokenRef.current.cancelled = true;
    lkRef.current?.disconnect();
    lkRef.current = null;
    setMode("pending");
  }, [roomGone]);

  // Demo/fallback playback via HLS.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || mode !== "hls") return;
    let cancelled = false;
    let hls: { destroy: () => void } | null = null;
    const tryPlay = () => {
      if (!cancelled && el.paused) {
        el.play()
          .then(() => setNeedsTap(false))
          .catch((err: DOMException) => {
            if (err?.name === "NotAllowedError") setNeedsTap(true);
          });
      }
    };
    el.addEventListener("canplay", tryPlay);
    el.addEventListener("loadeddata", tryPlay);
    // A load-interrupt can reject the first play() with a transient error the
    // NotAllowedError-only guard rightly ignores — without a retry the stage
    // then sits paused forever with no tap button. Nudge until playing.
    const nudge = setInterval(() => {
      if (cancelled || !el.paused || el.readyState < 2) return;
      tryPlay();
    }, 1500);
    const isHls = /\.m3u8(?:$|\?)/i.test(DEMO_LIVE_HLS);
    if (!isHls || el.canPlayType("application/vnd.apple.mpegurl") !== "") {
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
      el.removeEventListener("loadeddata", tryPlay);
      clearInterval(nudge);
      hls?.destroy();
    };
  }, [mode]);

  // Deal countdown reaches zero and reads "ended" — never a frozen 00:00:00.
  useEffect(() => {
    if (dealLeft === null) return;
    const t = setInterval(() => setDealLeft((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [dealLeft !== null]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    track({ type: "live.chat", subjectId: roomId, surface: "live" });

    // Pure-demo site: local simulation (no API exists) — the reply mirrors
    // the server brain's scripted rules so every question gets a sane answer.
    if (DEMO_MODE) {
      setMessages((m) => [...m, { from: "You", text }]);
      const reply = demoHostReply(text, room !== null && room !== "not_found" ? room.pinnedProductId : null);
      demoReplyTimerRef.current = setTimeout(
        () => setMessages((m) => [...m, { from: "Scopie", text: reply, isHost: true }]),
        900,
      );
      return;
    }

    // Real mode: the server owns the chat (and the AI host's answers ride
    // in on the 5 s poll).
    try {
      const res = await fetch(`${API_BASE}/v1/live/rooms/${roomId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) {
        const detail =
          res.status === 400
            ? "That message couldn't be posted."
            : "Chat is unavailable right now — try again in a moment.";
        if (res.status !== 400) setDraft(text); // moderation rejections stay cleared
        setMessages((m) => [...m, { from: "•", text: detail, isSystem: true }]);
        return;
      }
      const { message } = (await res.json()) as { message: ChatMsg };
      // NOTE: the cursor is NOT advanced here — skipping ahead would drop
      // other viewers' messages posted in the poll gap. The next poll
      // re-delivers this message and the id-dedupe below absorbs it.
      setMessages((m) => (m.some((x) => x.id === message.id) ? m : [...m, message].slice(-200)));
    } catch {
      setDraft(text); // a failed send must not eat what they typed
      setMessages((m) => [...m, { from: "•", text: "Chat is unavailable right now — try again in a moment.", isSystem: true }]);
    }
  };

  if (room === "not_found") {
    return (
      <main className="page page--pad" style={{ textAlign: "center", paddingTop: 80 }}>
        <Hero kind="tv" />
        <h1 className="page-title">This live has ended</h1>
        <p className="page-sub">The stream you're looking for isn't running any more.</p>
        <Link href="/live" className="btn btn-ghost">
          See who's live now
        </Link>
      </main>
    );
  }

  if (room && room.status === "ended") {
    return (
      <main className="page page--pad" style={{ textAlign: "center", paddingTop: 80 }}>
        <Hero kind="smile" />
        <h1 className="page-title">The stream just ended</h1>
        <p className="page-sub">Thanks for watching {room.title}.</p>
        <Link href="/live" className="btn btn-primary" style={{ width: "auto" }}>
          See who&rsquo;s live now
        </Link>
      </main>
    );
  }

  const dealActive = Boolean(room?.flashDeal) && dealLeft !== null && dealLeft > 0;
  const hh = Math.floor((dealLeft ?? 0) / 3600);
  const mm = Math.floor(((dealLeft ?? 0) % 3600) / 60);
  const ss = (dealLeft ?? 0) % 60;
  // A real room falling back to the sample loop must say so — a viewer must
  // never mistake the demo film for the seller's actual stream.
  const sampleFallback = !DEMO_MODE && mode === "hls";

  return (
    <main className="page page--pad">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>{room ? room.title : "Scopie Live"}</h1>
          {room?.hostType === "ai" && (
            <span className="ai-badge" title="This host is an AI avatar">
              <span aria-hidden="true">✦</span> AI Host — always disclosed
            </span>
          )}
        </div>
        {/* The badge asserts liveness — never show it before the room loads. */}
        {isLive && (
          <span className="live-badge">
            <span aria-hidden="true">●</span> LIVE
          </span>
        )}
      </div>

      <div className="live-stage">
        <video ref={videoRef} playsInline muted={muted} loop={mode === "hls"} poster="/posters/poster-a.png" />
        {room === null && (
          <div className="buffering" aria-hidden="true">
            <div className="ring"></div>
          </div>
        )}
        {sampleFallback && <span className="stage-tag">Sample preview — live video unavailable</span>}
        <button className="live-mute" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
          <StrokeIcon kind={muted ? "sound-off" : "sound-on"} size={19} />
        </button>
        {needsTap && (
          <button className="tap-to-play" onClick={tapToPlay} aria-label="Play stream">
            <StrokeIcon kind="play" size={44} />
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
              // The product sheet opens over the stream — the show keeps playing.
              onClick={() => {
                track({ type: "live.pin_tap", subjectId: pinned.id, surface: "live" });
                openProduct(pinned, "live");
              }}
              aria-label={`Shop ${pinned.title}`}
            >
              +
            </button>
          </div>
        )}
      </div>

      <div className="chatlog" aria-live="polite" ref={chatlogRef}>
        {messages.map((m, i) => (
          <div key={m.id ?? `local_${i}`} className="chatmsg" style={m.isSystem ? { color: "var(--faint)" } : undefined}>
            <b>
              {m.isHost ? (
                <>
                  <span aria-hidden="true">✦</span> Scopie
                </>
              ) : (
                m.from
              )}
            </b>{" "}
            {m.text}
            {m.product && (
              <span style={{ color: "var(--muted)", fontSize: 13 }}>
                {" "}
                · {m.product.title} — {formatRM(m.product.priceSen)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="chatrow">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
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
