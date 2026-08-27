"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Product, Video } from "@scopie/core";
import { formatRM } from "@/lib/demo";
import { track } from "@/lib/events";

interface Props {
  video: Video;
  product?: Product;
  active: boolean;
  /** Mounted window: only cards near the active index attach media. */
  near: boolean;
  muted: boolean;
  onToggleMute: () => void;
  /** Autoplay of unmuted video was blocked — feed must fall back to muted. */
  onForceMute: () => void;
}

/**
 * One feed item. Hard-won rules for real phones — do not relax:
 *
 *  1. STABLE EFFECTS. Every callback the media effects depend on is identity-
 *     stable (props go through refs). If the HLS attach effect re-runs on a
 *     parent re-render, the player is destroyed mid-scroll and the card goes
 *     black with a dead play button — the exact bug this design fixes.
 *  2. Play only after a source is attached (hls MANIFEST_PARSED / native
 *     canplay); a rejected play() shows the tap-to-play control ONLY for
 *     NotAllowedError (genuinely blocked). NotSupportedError/AbortError mean
 *     "source not ready yet" — the attach events will retry.
 *  3. Unmuting happens synchronously inside the tap gesture (el.muted +
 *     play()), never via a state round-trip — mobile browsers only allow
 *     audible playback from a user gesture.
 *  4. Watch time counts the element's own playing/pause events and flushes
 *     on deactivate AND unmount.
 */
export function VideoCard({ video, product, active, near, muted, onToggleMute, onForceMute }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const activeRef = useRef(active);
  const mutedRef = useRef(muted);
  const forceMuteRef = useRef(onForceMute);
  const playStartRef = useRef<number | null>(null);
  const watchAccumRef = useRef(0);
  const [liked, setLiked] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [buffering, setBuffering] = useState(false);

  activeRef.current = active;
  mutedRef.current = muted;
  forceMuteRef.current = onForceMute;

  /** Identity-stable: reads everything through refs. */
  const attemptPlay = useCallback(() => {
    const el = videoRef.current;
    if (!el || !activeRef.current) return;
    el.muted = mutedRef.current;
    el.preload = "auto";
    el.play()
      .then(() => setNeedsTap(false))
      .catch((err: DOMException) => {
        if (err?.name !== "NotAllowedError") return; // source not ready — attach events retry
        if (!el.muted) {
          // Audible autoplay blocked: degrade to muted rather than freezing.
          el.muted = true;
          forceMuteRef.current();
          el.play()
            .then(() => setNeedsTap(false))
            .catch((e2: DOMException) => {
              if (e2?.name === "NotAllowedError") setNeedsTap(true);
            });
        } else {
          // Even muted autoplay blocked (Low Power Mode / data saver).
          setNeedsTap(true);
        }
      });
  }, []);

  const flushWatch = useCallback(() => {
    if (playStartRef.current !== null) {
      watchAccumRef.current += Date.now() - playStartRef.current;
      playStartRef.current = null;
    }
    const watchMs = Math.round(watchAccumRef.current);
    watchAccumRef.current = 0;
    if (watchMs > 500) {
      track({ type: "video.watch", subjectId: video.id, watchMs, surface: "feed" });
    }
  }, [video.id]);

  // Attach / detach the stream based on the mounted window ONLY.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !near) return;
    let cancelled = false;

    const canNative = el.canPlayType("application/vnd.apple.mpegurl") !== "";
    if (canNative) {
      el.src = video.hlsUrl;
      const onCanPlay = () => attemptPlay();
      el.addEventListener("canplay", onCanPlay);
      return () => {
        el.removeEventListener("canplay", onCanPlay);
        el.removeAttribute("src");
        el.load();
      };
    }

    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) return;
      const hls = new Hls({
        // Fast first frame on mobile data: start at the lowest rung and let
        // ABR climb; keep buffers small — the user swipes in seconds.
        startLevel: 0,
        maxBufferLength: 10,
        backBufferLength: 10,
        capLevelToPlayerSize: true,
      });
      hls.loadSource(video.hlsUrl);
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, () => attemptPlay());
      // hls.js does not self-recover from fatal errors; without this, one
      // dropped segment on mobile data freezes the card forever.
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else setNeedsTap(true);
      });
      hlsRef.current = hls;
    });
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      el.removeAttribute("src");
      el.load();
    };
  }, [near, video.hlsUrl, attemptPlay]);

  // Watch-time + buffering state ride the element's own events.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onPlaying = () => {
      setBuffering(false);
      if (playStartRef.current === null) playStartRef.current = Date.now();
    };
    const onPause = () => {
      if (playStartRef.current !== null) {
        watchAccumRef.current += Date.now() - playStartRef.current;
        playStartRef.current = null;
      }
    };
    const onWaiting = () => setBuffering(true);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("pause", onPause);
    el.addEventListener("waiting", onWaiting);
    return () => {
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("waiting", onWaiting);
    };
  }, []);

  // Play/pause on active changes; flush on deactivate AND on unmount.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) {
      track({ type: "video.view", subjectId: video.id, surface: "feed" });
      if (el.paused) setBuffering(true);
      attemptPlay();
    } else {
      el.pause();
      setBuffering(false);
      setNeedsTap(false);
      flushWatch();
    }
    return () => {
      // Unmount while active (bottom-nav exit is the most common session end)
      // must not drop the final watch.
      if (activeRef.current) {
        el.pause();
        flushWatch();
      }
    };
  }, [active, video.id, attemptPlay, flushWatch]);

  /** In-gesture: mobile browsers only honor audio started from a tap. */
  const toggleMute = () => {
    const el = videoRef.current;
    const nextMuted = !mutedRef.current;
    if (el) {
      el.muted = nextMuted;
      if (!nextMuted && el.paused) void el.play().catch(() => undefined);
    }
    onToggleMute();
  };

  const tapToPlay = () => {
    setNeedsTap(false);
    attemptPlay();
  };

  const like = () => {
    setLiked((v) => !v);
    track({ type: liked ? "video.unlike" : "video.like", subjectId: video.id, surface: "feed" });
  };

  return (
    <section className="feed-item" aria-label={`Video by ${video.creatorId}`}>
      <video ref={videoRef} playsInline muted={muted} loop preload="metadata" poster={video.posterUrl} />
      {active && buffering && !needsTap && (
        <div className="buffering" aria-hidden="true">
          <div className="ring"></div>
        </div>
      )}
      {needsTap && (
        <button className="tap-to-play" onClick={tapToPlay} aria-label="Play video">
          ▶
        </button>
      )}
      <div className="feed-overlay">
        {product && (
          <button
            className="feed-product"
            // TODO: open the product sheet; until then this is a chip tap, not a sheet view.
            onClick={() => track({ type: "product.view", subjectId: product.id, surface: "feed", meta: { chip: true } })}
          >
            <div>
              <b>{product.title}</b>
              <span className="price">{formatRM(product.priceSen)}</span>
            </div>
          </button>
        )}
        <div className="feed-creator">@{video.creatorId}</div>
        <div className="feed-caption">{video.caption}</div>
        <div className="feed-tags">{video.hashtags.map((t) => `#${t}`).join(" ")}</div>
      </div>
      <div className="feed-actions">
        <button className={`feed-action${liked ? " liked" : ""}`} onClick={like} aria-pressed={liked}>
          <span className="icon">♥</span>
          {(video.stats.likes ?? 0) + (liked ? 1 : 0)}
        </button>
        <button
          className="feed-action"
          onClick={() => track({ type: "video.comment", subjectId: video.id, surface: "feed" })}
        >
          <span className="icon">💬</span>
          {video.stats.comments ?? 0}
        </button>
        <button
          className="feed-action"
          onClick={() => track({ type: "video.share", subjectId: video.id, surface: "feed" })}
        >
          <span className="icon">↗</span>
          {video.stats.shares ?? 0}
        </button>
        <button className="feed-action" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
          <span className="icon">{muted ? "🔇" : "🔊"}</span>
        </button>
      </div>
    </section>
  );
}
