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
import { HelmetMark, Wordmark } from "@/components/Brand";
import { CartButton, useCommerce } from "@/components/commerce/Commerce";
import { Hero, StrokeIcon } from "@/components/Glyph";
import { isFollowing, toggleFollow } from "@/lib/social";
import { track } from "@/lib/events";

const compact = new Intl.NumberFormat("en-MY", { notation: "compact" });

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
  /** Consecutive failed room loads — bounded so the ring can never be forever. */
  const loadFailuresRef = useRef(0);
  // Demo rooms resolve synchronously — seed at first render so entering a
  // room never paints a loading ring on the demo site.
  const [room, setRoom] = useState<RoomView | null | "not_found">(() =>
    DEMO_MODE ? ((demoRooms.find((r) => r.id === roomId) as RoomView | undefined) ?? "not_found") : null,
  );
  const [mode, setMode] = useState<PlaybackMode>("pending");
  const [connectAttempt, setConnectAttempt] = useState(0);
  const [messages, setMessages] = useState<ChatMsg[]>(DEMO_MODE ? DEMO_CHAT : []);
  const [draft, setDraft] = useState("");
  const [dealLeft, setDealLeft] = useState<number | null>(null);
  const [muted, setMuted] = useState(true);
  const [needsTap, setNeedsTap] = useState(false);
  // Social chrome on the surface — local until accounts own the graph.
  const [following, setFollowing] = useState(false);
  const [liked, setLiked] = useState(false);
  const chatlogRef = useRef<HTMLDivElement>(null);
  const lastChatIdRef = useRef("0");
  const demoReplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { openProduct, buyNow } = useCommerce();

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
    loadFailuresRef.current = 0;
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

  // Follows live on this device for now (same store the creator pages use).
  useEffect(() => {
    setFollowing(isFollowing(`live:${roomId}`));
  }, [roomId]);

  // In real mode the server resolves the pinned product; the local demo
  // catalog is only consulted on the pure-demo site.
  const pinned: Product | null | undefined = useMemo(() => {
    if (!room || room === "not_found") return undefined;
    if (room.pinnedProduct !== undefined) return room.pinnedProduct;
    if (DEMO_MODE) return demoProducts.find((p) => p.id === room.pinnedProductId) ?? null;
    return null;
  }, [room]);

  // The product rail (the mock's right-hand shelf): pinned first, then the
  // rest of the show's catalog. Real rooms only reliably know the pin today.
  const rail: Product[] = useMemo(() => {
    const rest = DEMO_MODE ? demoProducts.filter((p) => p.id !== pinned?.id) : [];
    return [...(pinned ? [pinned] : []), ...rest].slice(0, 3);
  }, [pinned]);

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
          loadFailuresRef.current = 0;
          setRoom(view);
        } catch {
          if (token.cancelled) return;
          // Bounded: after three failed loads a configured-but-unreachable
          // API degrades to the labeled sample loop (or the ended screen) —
          // "everything degrades to demo" means this room too, never an
          // infinite ring.
          loadFailuresRef.current += 1;
          if (loadFailuresRef.current >= 3) {
            const sample = demoRooms.find((r) => r.id === roomId) as RoomView | undefined;
            setRoom(sample ?? "not_found");
            if (sample?.status === "live") setMode("hls");
            return;
          }
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
        <Link href="/" className="btn btn-ghost">
          Back to the feed
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
        <Link href="/" className="btn btn-primary" style={{ width: "auto" }}>
          Back to the feed
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
    <main className="live-surface">
      <h1 className="sr-only">{room ? room.title : "Scopie Live"}</h1>
      <video
        className="ls-video"
        ref={videoRef}
        playsInline
        muted={muted}
        loop={mode === "hls"}
        poster="/videos/posters/kalima-ai-model.jpg"
      />
      {room === null && (
        <div className="buffering" aria-hidden="true">
          <div className="ring"></div>
        </div>
      )}
      {needsTap && (
        <button className="tap-to-play" onClick={tapToPlay} aria-label="Play stream">
          <StrokeIcon kind="play" size={44} />
        </button>
      )}

      {/* top chrome: the way home, then liveness */}
      <header className="ls-top">
        <Link href="/" className="ls-brand">
          <span className="brand-visual" aria-hidden="true">
            <HelmetMark size={27} fill="#ffffff" />
            <Wordmark color="#ffffff" />
          </span>
          <span className="sr-only">Scopie home</span>
        </Link>
        <span className="ls-top-right">
          {/* The badge asserts liveness — never show it before the room loads. */}
          {isLive && (
            <span className="live-badge">
              <span aria-hidden="true">●</span> LIVE
            </span>
          )}
          {room && (
            <span className="ls-viewers">
              <span aria-hidden="true">✦</span> {compact.format(room.viewerCount)} watching
            </span>
          )}
        </span>
      </header>

      {/* host row */}
      <div className="ls-host">
        <span className="grow">
          <b>{room ? room.title : "Scopie Live"}</b>
          <span className="ls-host-sub">
            {room?.hostType === "ai" && (
              <span className="ai-badge" title="This host is an AI avatar">
                <span aria-hidden="true">✦</span> AI Host
              </span>
            )}
            {sampleFallback && <span className="stage-tag ls-sample">Sample preview — live video unavailable</span>}
          </span>
        </span>
        <button
          className={`ls-follow${following ? " on" : ""}`}
          aria-pressed={following}
          onClick={() => setFollowing(toggleFollow(`live:${roomId}`))}
        >
          {following ? "Following ✓" : "Follow"}
        </button>
      </div>

      {/* the shelf: pinned first, tap opens the product sheet over the show */}
      {rail.length > 0 && (
        <div className="ls-rail" role="group" aria-label="Products in this live">
          {rail.map((p) => (
            <button
              key={p.id}
              className="ls-rail-card"
              onClick={() => {
                track({ type: "live.pin_tap", subjectId: p.id, surface: "live" });
                openProduct(p, "live");
              }}
              aria-label={`${p.title}, ${formatRM(p.priceSen)}`}
            >
              {p.imageUrl && <img src={p.imageUrl} alt="" />}
              {/* whole ringgit, like the mock — the sheet shows exact prices */}
              <span className="ls-rail-price">RM {Math.round(p.priceSen / 100)}</span>
            </button>
          ))}
        </div>
      )}

      {/* bottom cluster: chat, pinned bar, one input */}
      <div className="ls-bottom">
        <div className="ls-chat" aria-live="polite" ref={chatlogRef}>
          {messages.map((m, i) => (
            <div key={m.id ?? `local_${i}`} className={`ls-msg${m.isSystem ? " system" : ""}`}>
              {m.isHost ? (
                <span className="ls-avatar ls-avatar--scopie" aria-hidden="true">
                  <HelmetMark size={16} fill="#ffffff" />
                </span>
              ) : (
                <span className="ls-avatar" aria-hidden="true">
                  {(m.from[0] ?? "•").toUpperCase()}
                </span>
              )}
              <span className="ls-msg-body">
                <b>{m.isHost ? "scopie" : m.from}</b>
                <span>
                  {m.text}
                  {m.product && (
                    <span className="ls-msg-product">
                      {" "}
                      · {m.product.title} — {formatRM(m.product.priceSen)}
                    </span>
                  )}
                </span>
              </span>
            </div>
          ))}
        </div>

        {pinned && (
          <div className="ls-pin">
            <button
              className="ls-pin-body"
              // The product sheet opens over the stream — the show keeps playing.
              onClick={() => {
                track({ type: "live.pin_tap", subjectId: pinned.id, surface: "live" });
                openProduct(pinned, "live");
              }}
              aria-label={`View ${pinned.title}`}
            >
              {pinned.imageUrl && <img src={pinned.imageUrl} alt="" />}
              <span className="grow">
                <b>{pinned.title}</b>
                <span className="ls-pin-price">{formatRM(pinned.priceSen)}</span>
                {room?.flashDeal && (
                  <span className="deal">
                    {dealActive
                      ? `${room.flashDeal.discountPct}% OFF · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
                      : "Deal ended"}
                  </span>
                )}
              </span>
            </button>
            <button
              className="btn btn-primary ls-buy"
              // Buy = straight to the Scopie Pay confirmation; the tap is the authorization.
              onClick={() => {
                track({ type: "live.pin_tap", subjectId: pinned.id, surface: "live" });
                buyNow(pinned, "live");
              }}
              aria-label={`Buy ${pinned.title}`}
            >
              Buy
            </button>
          </div>
        )}

        <div className="ls-inputrow">
          <div className="ls-say">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === "Enter") void send();
              }}
              placeholder="Say something…"
              aria-label="Chat — Scopie answers questions"
            />
            {/* one affordance: the AI spark at rest, send once there's a draft */}
            {draft.trim() ? (
              <button className="ls-send" onClick={() => void send()} aria-label="Send">
                <StrokeIcon kind="share" size={16} />
              </button>
            ) : (
              <span className="ls-say-spark" aria-hidden="true" title="Scopie answers questions here">
                <StrokeIcon kind="spark" size={15} />
              </span>
            )}
          </div>
          <CartButton />
          <button
            className={`ls-like${liked ? " on" : ""}`}
            aria-pressed={liked}
            aria-label="Like this live"
            onClick={() => {
              setLiked((v) => !v);
              track({ type: "live.like", subjectId: roomId, surface: "live" });
            }}
          >
            <StrokeIcon kind="heart" size={19} />
          </button>
          <button className="live-mute ls-mute" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
            <StrokeIcon kind={muted ? "sound-off" : "sound-on"} size={19} />
          </button>
        </div>
      </div>
    </main>
  );
}
