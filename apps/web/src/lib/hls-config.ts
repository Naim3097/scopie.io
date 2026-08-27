/**
 * Shared hls.js tuning for phones. One definition so the feed and the live
 * room can never drift apart again.
 *
 *  - startLevel 0: paint the first frame from the lowest rung, let ABR climb.
 *  - small buffers: users swipe within seconds; a 30s standing buffer is
 *    wasted data on 4G.
 *  - explicit level cap at 720p: capLevelToPlayerSize alone is defeated on
 *    full-screen portrait players (hls.js caps by max(w,h)×dpr, which lands
 *    at 1080p on a 720×1600 @2dpr budget phone), so we cap levels directly
 *    after the manifest arrives.
 */
export const MOBILE_HLS_CONFIG = {
  startLevel: 0,
  maxBufferLength: 10,
  backBufferLength: 10,
  capLevelToPlayerSize: true,
} as const;

interface LevelLike {
  width: number;
  height: number;
}

export function applyLevelCap(
  hls: { levels: LevelLike[]; autoLevelCapping: number },
  maxSmallEdge = 720,
): void {
  let cap = -1;
  hls.levels.forEach((lvl, i) => {
    if (Math.min(lvl.width || 0, lvl.height || 0) <= maxSmallEdge) cap = i;
  });
  if (cap >= 0) hls.autoLevelCapping = cap;
}
