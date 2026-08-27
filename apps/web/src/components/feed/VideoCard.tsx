"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Product, Video } from "@scopie/core";
import { formatRM } from "@/lib/demo";
import { MOBILE_HLS_CONFIG, applyLevelCap } from "@/lib/hls-config";
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

const compact = new Intl.NumberFormat("en-MY", { notation: "compact" });

/**
 * One feed item. Hard-won rules for real phones — do not relax:
 *
 *  1. STABLE EFFECTS. Every callback the media effects depend on is identity-
 *     stable (props go through refs). If the attach effect re-runs on a parent
 *     re-render, the player is destroyed mid-scroll and the card goes black.
 *  2. ONE ATTACHED PLAYER AT A TIME. iOS Safari and low-end Android allow
 *     very few concurrent media pipelines; a preloaded neighbour holding a
 *     decoder is exactly why "the next video stays on loading forever".
 *  3. NO DEAD ENDS. The stall watchdog never disarms: it detects stalls by
 *     playback POSITION (not readyState, so slow-but-progressing networks
 *     aren't punished), resumes from the same position after a re-attach,
 *     pauses its ladder while tap-to-play is showing, and re-arms after
 *     every tap. A failed hls.js chunk load (deploy skew) surfaces
 *     tap-to-play instead of an unhandled rejection.
 *  4. Unmuting happens synchronously inside the tap gesture (el.muted +
 *     play()) — mobile browsers only allow audible playback from a gesture.
 *  5. Watch time counts the element's own playing/pause events and flushes
 *     on deactivate AND unmount.
 */
export const VideoCard = memo(function VideoCard({
  video,
  product,
  active,
  near: _near,
  muted,
  onToggleMute,
  onForceMute,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const activeRef = useRef(active);
  const mutedRef = useRef(muted);
  const forceMuteRef = useRef(onForceMute);
  const playStartRef = useRef<number | null>(null);
  const watchAccumRef = useRef(0);
  /** Watchdog state: escalation counter + last observed playback position. */
  const attemptsRef = useRef(0);
  const lastPosRef = useRef(-1);
  /** Position to resume from after a recovery re-attach. */
  const resumePosRef = useRef(0);
  const [liked, setLiked] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [buffering, setBuffering] = useState(false);
  /** Bumping this forces a clean re-attach (recovery path). */
  const [epoch, setEpoch] = useState(0);
  /** needsTap mirrored into a ref so the watchdog reads fresh state. */
  const needsTapRef = useRef(needsTap);

  activeRef.current = active;
  mutedRef.current = muted;
  forceMuteRef.current = onForceMute;
  needsTapRef.current = needsTap;

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
    const resumeAt = resumePosRef.current;
    resumePosRef.current = 0;

    const canNative = el.canPlayType("application/vnd.apple.mpegurl") !== "";
    if (canNative) {
      el.src = video.hlsUrl;
      const onLoadedMeta = () => {
        if (resumeAt > 0 && Number.isFinite(el.duration) && resumeAt < el.duration) {
          el.currentTime = resumeAt;
        }
      };
      const onCanPlay = () => attemptPlay();
      el.addEventListener("loadedmetadata", onLoadedMeta);
      el.addEventListener("canplay", onCanPlay);
      el.load();
      return () => {
        el.removeEventListener("loadedmetadata", onLoadedMeta);
        el.removeEventListener("canplay", onCanPlay);
        el.removeAttribute("src");
        el.load(); // releases the decoder for the next card
      };
    }

    import("hls.js")
      .then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) return;
        const hls = new Hls({ ...MOBILE_HLS_CONFIG, startPosition: resumeAt > 0 ? resumeAt : -1 });
        hls.loadSource(video.hlsUrl);
        hls.attachMedia(el);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          applyLevelCap(hls); // real 720p cap — capLevelToPlayerSize alone over-selects on portrait
          attemptPlay();
        });
        // hls.js does not self-recover from fatal errors on its own.
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else setNeedsTap(true);
        });
        hlsRef.current = hls;
      })
      .catch(() => {
        // Chunk load failed (deploy skew / flaky network): recoverable UI,
        // never an unhandled rejection with a spinner behind it.
        if (!cancelled) {
          setBuffering(false);
          setNeedsTap(true);
        }
      });
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      el.removeAttribute("src");
      el.load();
    };
  }, [active, epoch, video.hlsUrl, attemptPlay]);

  // Stall watchdog — always armed while active. Escalation ladder per stalled
  // tick (3s): retry play → re-attach at the same position → tap-to-play.
  // The ladder pauses (not disarms) while hidden or while tap-to-play shows,
  // and resets whenever playback position advances.
  useEffect(() => {
    if (!active) return;
    attemptsRef.current = 0;
    lastPosRef.current = -1;
    const timer = setInterval(() => {
      const el = videoRef.current;
      if (!el) return;
      if (document.visibilityState === "hidden") {
        attemptsRef.current = 0; // OS pauses are not stalls
        return;
      }
      if (needsTapRef.current) return; // blocked, not stalled — wait for the tap
      const progressed = !el.paused && el.currentTime > lastPosRef.current + 0.1;
      lastPosRef.current = el.currentTime;
      if (progressed) {
        attemptsRef.current = 0;
        return;
      }
      attemptsRef.current += 1;
      if (attemptsRef.current === 1) {
        attemptPlay();
      } else if (attemptsRef.current === 2) {
        resumePosRef.current = el.currentTime;
        setEpoch((e) => e + 1);
      } else {
        attemptsRef.current = 0; // tap re-enters the ladder from the top
        setBuffering(false);
        setNeedsTap(true);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [active, attemptPlay]);

  // Resume promptly when the app returns to the foreground — iOS does not
  // auto-resume after screen lock, and waiting for the next watchdog tick
  // leaves up to 3s of frozen frame.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && activeRef.current) {
        attemptsRef.current = 0;
        attemptPlay();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [attemptPlay]);

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
    setNeedsTap(false); // watchdog re-arms automatically (ladder reads this)
    attemptsRef.current = 0;
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

  const likeCount = (video.stats.likes ?? 0) + (liked ? 1 : 0);

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
        <button
          className={`feed-action${liked ? " liked" : ""}`}
          onClick={like}
          aria-pressed={liked}
          aria-label={`Like, ${likeCount} likes`}
        >
          <span className="icon" aria-hidden="true">
            ♥
          </span>
          {compact.format(likeCount)}
        </button>
        <button
          className="feed-action"
          onClick={() => track({ type: "video.comment", subjectId: video.id, surface: "feed" })}
          aria-label={`Comments, ${video.stats.comments ?? 0}`}
        >
          <span className="icon" aria-hidden="true">
            💬
          </span>
          {compact.format(video.stats.comments ?? 0)}
        </button>
        <button
          className="feed-action"
          onClick={() => track({ type: "video.share", subjectId: video.id, surface: "feed" })}
          aria-label={`Share, ${video.stats.shares ?? 0}`}
        >
          <span className="icon" aria-hidden="true">
            ↗
          </span>
          {compact.format(video.stats.shares ?? 0)}
        </button>
        <button className="feed-action" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
          <span className="icon" aria-hidden="true">
            {muted ? "🔇" : "🔊"}
          </span>
        </button>
      </div>
    </section>
  );
});
