"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Product, Video } from "@scopie/core";
import { formatRM } from "@/lib/demo";
import { track } from "@/lib/events";

interface Props {
  video: Video;
  product?: Product;
  active: boolean;
  /**
   * Reserved: neighbour hint for a future single-player preload pool.
   * Media is deliberately NOT attached to non-active cards — see rule 2.
   */
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
 *     stable (props go through refs). If the attach effect re-runs on a parent
 *     re-render, the player is destroyed mid-scroll and the card goes black.
 *  2. ONE ATTACHED PLAYER AT A TIME. iOS Safari and low-end Android allow
 *     very few concurrent media pipelines; a preloaded neighbour holding a
 *     decoder is exactly why "the next video stays on loading forever".
 *     Media attaches when a card becomes active and is fully released
 *     (hls.destroy + src removal) when it deactivates. Preload-ahead returns
 *     later via a single reused player pool, never via parallel pipelines.
 *  3. NO INFINITE SPINNER. A stall watchdog retries play, then rebuilds the
 *     attachment from scratch, then surfaces tap-to-play.
 *  4. Unmuting happens synchronously inside the tap gesture (el.muted +
 *     play()) — mobile browsers only allow audible playback from a gesture.
 *  5. Watch time counts the element's own playing/pause events and flushes
 *     on deactivate AND unmount.
 */
export function VideoCard({ video, product, active, near: _near, muted, onToggleMute, onForceMute }: Props) {
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
  /** Bumping this forces a clean re-attach (watchdog recovery path). */
  const [epoch, setEpoch] = useState(0);

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

  // Attach media for the ACTIVE card only; release the pipeline on deactivate.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !active) return;
    let cancelled = false;

    const canNative = el.canPlayType("application/vnd.apple.mpegurl") !== "";
    if (canNative) {
      el.src = video.hlsUrl;
      const onCanPlay = () => attemptPlay();
      el.addEventListener("canplay", onCanPlay);
      el.load();
      return () => {
        el.removeEventListener("canplay", onCanPlay);
        el.removeAttribute("src");
        el.load(); // releases the decoder for the next card
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
      // hls.js does not self-recover from fatal errors on its own.
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
  }, [active, epoch, video.hlsUrl, attemptPlay]);

  // Stall watchdog: an active card must reach 'playing'. Escalate:
  // retry play → clean re-attach → tap-to-play. Never an infinite spinner.
  useEffect(() => {
    if (!active) return;
    let attempts = 0;
    const timer = setInterval(() => {
      const el = videoRef.current;
      // A hidden page legitimately pauses media — don't fight the browser.
      if (!el || document.visibilityState === "hidden") return;
      if (!el.paused && el.readyState >= 3) {
        attempts = 0;
        return;
      }
      attempts += 1;
      if (attempts === 1) {
        attemptPlay();
      } else if (attempts === 2) {
        setEpoch((e) => e + 1);
      } else {
        clearInterval(timer);
        setBuffering(false);
        setNeedsTap(true);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [active, attemptPlay]);

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
    const el = videoRef.current;
    if (el && (el.currentSrc || el.src)) {
      attemptPlay(); // in-gesture play on the attached source
    } else {
      setBuffering(true);
      setEpoch((e) => e + 1); // source was lost — rebuild the attachment
    }
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
