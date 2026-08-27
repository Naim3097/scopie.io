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
 * One feed item. The TikTok feel is three client-side habits:
 *  1. attach HLS for the active card AND its neighbours (preload ahead),
 *  2. play only after a source is actually attached (hls MANIFEST_PARSED /
 *     native canplay) — never fire play() at a source-less element,
 *  3. count watch time from the element's own playing/pause events, so
 *     background time never inflates the recommender's main signal, and
 *     flush it on deactivate AND unmount.
 * iOS Safari plays HLS natively; everywhere else uses hls.js. If unmuted
 * autoplay is blocked (iOS after user unmute, Low Power Mode), fall back to
 * muted and finally to a visible tap-to-play control — never a silent freeze.
 */
export function VideoCard({ video, product, active, near, muted, onToggleMute, onForceMute }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const activeRef = useRef(active);
  const playStartRef = useRef<number | null>(null);
  const watchAccumRef = useRef(0);
  const [liked, setLiked] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);

  activeRef.current = active;

  const attemptPlay = useCallback(() => {
    const el = videoRef.current;
    if (!el || !activeRef.current) return;
    el.play()
      .then(() => setNeedsTap(false))
      .catch(() => {
        if (!el.muted) {
          // Audible autoplay blocked (iOS requires a user gesture): retry muted.
          el.muted = true;
          onForceMute();
          el.play()
            .then(() => setNeedsTap(false))
            .catch(() => setNeedsTap(true));
        } else {
          // Even muted autoplay blocked (Low Power Mode / data saver).
          setNeedsTap(true);
        }
      });
  }, [onForceMute]);

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

  // Attach / detach the stream based on the mounted window.
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
      const hls = new Hls({ maxBufferLength: 10, capLevelToPlayerSize: true });
      hls.loadSource(video.hlsUrl);
      hls.attachMedia(el);
      // Play only once a source is genuinely attached — a play() before this
      // rejects with NotSupportedError and nothing would retry.
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

  // Watch-time accounting rides the element's own state, not our intent.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onPlaying = () => {
      if (playStartRef.current === null) playStartRef.current = Date.now();
    };
    const onPause = () => {
      if (playStartRef.current !== null) {
        watchAccumRef.current += Date.now() - playStartRef.current;
        playStartRef.current = null;
      }
    };
    el.addEventListener("playing", onPlaying);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("pause", onPause);
    };
  }, []);

  // Play/pause on active changes; flush on deactivate AND on unmount.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) {
      track({ type: "video.view", subjectId: video.id, surface: "feed" });
      attemptPlay();
    } else {
      el.pause();
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

  const like = () => {
    setLiked((v) => !v);
    track({ type: liked ? "video.unlike" : "video.like", subjectId: video.id, surface: "feed" });
  };

  return (
    <section className="feed-item" aria-label={`Video by ${video.creatorId}`}>
      <video ref={videoRef} playsInline muted={muted} loop preload="metadata" poster={video.posterUrl} />
      {needsTap && (
        <button className="tap-to-play" onClick={attemptPlay} aria-label="Play video">
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
        <button className="feed-action" onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"}>
          <span className="icon">{muted ? "🔇" : "🔊"}</span>
        </button>
      </div>
    </section>
  );
}
