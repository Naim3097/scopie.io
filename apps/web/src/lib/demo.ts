import type { Video, LiveRoom } from "@scopie/core";
import { demoProducts } from "./catalog";
import { DROPS } from "./drops";

/** Client-side demo data, used when the API is unreachable (static preview). */

// The catalog is the real client base migrated from the first MVP — see
// lib/catalog.ts (17 merchants, real prices, price-on-request honoured).
export { demoProducts, demoSellers, sellerOf } from "./catalog";

/**
 * Feed clips: self-hosted under /public/videos (720p H.264, faststart) —
 * no third-party stream dependency. Ids double as ?v= deep-link targets
 * and comment-store keys, so keep them stable.
 */
interface Clip {
  slug: string;
  creator: string;
  caption: string;
  tags: string[];
  products?: string[];
}

// Batik Dolu-Dolu is HOOR's own collection — those campaign clips belong to
// the hoor creator page. Product tags link clips to the migrated catalog.
const CLIPS: Clip[] = [
  { slug: "scopie-concept", creator: "scopie", caption: "Welcome to Scopie — meet your new digital world ✨", tags: ["Scopie", "NewDigitalWorld"] },
  { slug: "kalima-ai-model", creator: "kalima", caption: "Meet Kalima — AI model, always disclosed ✦", tags: ["AIModel", "AIonScopie"] },
  { slug: "problem-solving", creator: "scopie", caption: "Built to solve real problems 💡", tags: ["BuildWithScopie"] },
  { slug: "batik-modern", creator: "hoor", caption: "Batik, but make it modern 🌺", tags: ["ModernBatik", "BatikDoluDolu"], products: ["hoor-senja"] },
  { slug: "hoor-ugc-1", creator: "hoor", caption: "Get ready with me ✨", tags: ["GRWM", "OOTD"], products: ["hoor-anggerik"] },
  { slug: "not-ai-1", creator: "scopie", caption: "Not AI… or is it? ✦", tags: ["SpotTheAvatar"] },
  { slug: "kalima-photoshoot-1", creator: "kalima", caption: "Behind the shoot 📸", tags: ["BTS", "Photoshoot"], products: ["kalima-ruwa-caftan"] },
  { slug: "batik-traditional", creator: "hoor", caption: "Traditional batik, timeless craft", tags: ["Batik", "Heritage"], products: ["hoor-pusaka"] },
  { slug: "hoor-ugc-2", creator: "hoor", caption: "Everyday fit check 🔥", tags: ["OOTD", "FitCheck"], products: ["hoor-rimbun"] },
  { slug: "digital-human", creator: "scopie", caption: "Digital humans are here — always disclosed ✦", tags: ["AIonScopie"] },
  { slug: "kalima-ugc-1", creator: "kalima", caption: "Trying this trend 💜", tags: ["Trending"], products: ["kalima-anna-top"] },
  { slug: "nexova-product-intro", creator: "nexova", caption: "Product intro, done right 🎬", tags: ["ProductLaunch"], products: ["byki-obd2-kit"] },
  { slug: "not-ai-2", creator: "scopie", caption: "Real or rendered? 👀 ✦", tags: ["SpotTheAvatar"] },
  { slug: "hoor-ugc-3", creator: "hoor", caption: "You asked, I answered 💬", tags: ["AskMeAnything"], products: ["hoor-renda-camel"] },
  { slug: "kalima-daily-life", creator: "kalima", caption: "A day in my life 🌤", tags: ["DayInMyLife"] },
  { slug: "batik-release", creator: "hoor", caption: "New release loading… 👀", tags: ["ComingSoon", "BatikDoluDolu"], products: ["hoor-semarak"] },
  { slug: "i-look-real", creator: "scopie", caption: "I look real, don't I? ✦ AI — always labeled", tags: ["SpotTheAvatar"] },
  { slug: "kalima-ugc-2", creator: "kalima", caption: "New drop — who's in? 👀", tags: ["NewDrop"], products: ["kalima-danisya-set"] },
  { slug: "glimsy-reel-1", creator: "glimsy", caption: "Dinner muse set — own the look 💜", tags: ["OOTD", "GlimsyCloset"], products: ["glimsy-blouse"] },
  { slug: "hoor-ugc-4", creator: "hoor", caption: "Little things, big vibes ✨", tags: ["DailyFinds"] },
  { slug: "not-ai-3", creator: "scopie", caption: "Look closer ✦ AI, always disclosed", tags: ["AIonScopie"] },
  { slug: "kalima-photoshoot-2", creator: "kalima", caption: "Golden hour on set ✨", tags: ["GoldenHour"], products: ["kalima-serra-scallop"] },
  { slug: "project-based", creator: "scopie", caption: "From idea to launch 🚀", tags: ["Builders"] },
  { slug: "glimsy-reel-2", creator: "glimsy", caption: "Satin midi, everyday grace 🤍", tags: ["ModestStyle"], products: ["glimsy-midi-skirt"] },
  { slug: "kalima-ugc-3", creator: "kalima", caption: "Weekend mood ✨", tags: ["Weekend"], products: ["kalima-chiffon-shawl"] },
  { slug: "nexova-cinematic", creator: "nexova", caption: "Cinematic mode: ON 🎬", tags: ["CinematicAds"] },
  { slug: "not-ai-4", creator: "scopie", caption: "Blink and you'll miss it ✦", tags: ["SpotTheAvatar"] },
  { slug: "kalima-slow-cut", creator: "kalima", caption: "Slow it down 🎞", tags: ["Cinematic"], products: ["kalima-luna-palazo"] },
  { slug: "glimsy-reel-3", creator: "glimsy", caption: "Café knit kind of morning ☕", tags: ["CafeFit", "GlimsyCloset"], products: ["glimsy-knit-top"] },
  { slug: "digital-identity", creator: "scopie", caption: "Your digital identity, powered by Scopie 🔐", tags: ["ScopieID"] },
];

function clipHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export const demoVideos: Video[] = CLIPS.map((c) => {
  const h = clipHash(c.slug);
  return {
    id: c.slug,
    creatorId: c.creator,
    caption: c.caption,
    hlsUrl: `/videos/${c.slug}.mp4`,
    posterUrl: `/videos/posters/${c.slug}.jpg`,
    hashtags: c.tags,
    productIds: c.products ?? [],
    stats: {
      likes: 300 + (h % 4200),
      comments: 8 + (h % 230),
      shares: 5 + (h % 150),
    },
  };
});

export const demoRooms: LiveRoom[] = [
  {
    id: "room_scopie_live",
    title: "Scopie Live — Today's Picks",
    hostType: "ai",
    aiDisclosed: true,
    status: "live",
    viewerCount: 1200,
    pinnedProductId: "sugarbomb-hush-lush",
    // Hush Lush's genuine sale pair (RM45.90 → RM39.90) ≈ 13% off.
    flashDeal: { productId: "sugarbomb-hush-lush", discountPct: 13, endsAtStreamMs: 2 * 60 * 60 * 1000 },
  },
  {
    id: "room_hoor",
    title: "HOOR — Batik Dolu-Dolu Try-On",
    hostType: "seller",
    aiDisclosed: true,
    status: "live",
    viewerCount: 640,
    pinnedProductId: "hoor-pusaka",
    flashDeal: null,
  },
  {
    id: "room_kalima",
    title: "Kalima — Raya Drop Styling",
    hostType: "ai",
    aiDisclosed: true,
    status: "live",
    viewerCount: 380,
    pinnedProductId: "kalima-ruwa-caftan",
    flashDeal: null,
  },
  {
    id: "room_mael",
    title: "Mael Burger — Smash Night",
    hostType: "seller",
    aiDisclosed: true,
    status: "live",
    viewerCount: 210,
    pinnedProductId: "mael-cheezy",
    flashDeal: null,
  },
];

/** Live-room sample loop — a self-hosted clip, looped by the player. */
export const DEMO_LIVE_HLS = "/videos/kalima-photoshoot-1.mp4";

/**
 * Scripted opening chat for a demo room, grounded on the room's own pinned
 * product — a HOOR live opens talking about kaftans, not perfume.
 */
export function demoChatFor(roomId: string): { from: string; text: string; isHost?: boolean }[] {
  const room = demoRooms.find((r) => r.id === roomId);
  const pinned = demoProducts.find((p) => p.id === room?.pinnedProductId);
  if (!pinned) {
    return [
      { from: "Nurul", text: "Love this! 😍" },
      { from: "Scopie", text: "Ask me about any product in this show — I'll find it for you ✨", isHost: true },
    ];
  }
  // Quote the DROP price only where a genuine deal pair exists for this room.
  const drop = room ? DROPS[room.id] : undefined;
  const dealLine =
    drop && drop.dealPriceSen < pinned.priceSen && drop.productId === pinned.id
      ? `${pinned.title} drops to ${formatRM(drop.dealPriceSen)} when the drop opens — usually ${formatRM(pinned.priceSen)} ✨`
      : `${pinned.title} is ${formatRM(pinned.priceSen)} — tap the card to grab it ✨`;
  return [
    { from: "Nurul", text: "Love this! 😍" },
    { from: "Aiman", text: "How much is this one?" },
    { from: "Scopie", text: dealLine, isHost: true },
  ];
}

export function formatRM(sen: number): string {
  return `RM ${(sen / 100).toFixed(2)}`;
}

/**
 * Pure-demo live-host reply — a client-side mirror of the API brain's
 * scripted rules, so the zero-backend site never answers a shipping
 * question with "let me show you another colour".
 */
export function demoHostReply(question: string, pinnedProductId?: string | null): string {
  const q = question.toLowerCase();
  const words = q.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const match =
    demoProducts.find((p) =>
      words.some((w) => p.title.toLowerCase().includes(w) || p.tags.some((t) => t.includes(w) || w.includes(t))),
    ) ??
    demoProducts.find((p) => p.id === pinnedProductId) ??
    null;

  if (/deal|discount|promo|diskaun|offer/.test(q)) {
    return "Watch for the drop card — when it's on screen, the price on it is live. First come, first served ✨";
  }
  if (/how much|price|cost|berapa|harga/.test(q) && match) {
    return match.enquiryOnly
      ? `${match.title} is quoted per order — the seller confirms pricing directly. Tap the card for details.`
      : `${match.title} is ${formatRM(match.priceSen)} — tap the card to grab it ✨`;
  }
  if (/ship|delivery|deliver|pos|penghantaran|arrive/.test(q)) {
    return "Delivery is shown at checkout before you pay — nothing is charged until you confirm.";
  }
  if (/size|saiz|fit|colour|color|warna/.test(q) && match) {
    return match.variant
      ? `This one comes as ${match.variant}. Tap the card for the full options.`
      : `Tap the card for ${match.title} — all options are listed there.`;
  }
  if (match) return `Take a look at ${match.title} — I think you'll like this one ✨`;
  return "Ask me about any product, price or size in this show — I'll find it for you ✨";
}
