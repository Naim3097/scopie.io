import type { Product, Video, LiveRoom } from "@scopie/core";

/** Client-side demo data, used when the API is unreachable (static preview). */

// Product images are self-hosted (no third-party image host in the render path).
export const demoProducts: Product[] = [
  {
    id: "p_luxe_bag",
    sellerId: "s_aisyah",
    title: "Luxe Leather Bag",
    variant: "Beige",
    priceSen: 18900,
    imageUrl: "/products/luxe-bag.png",
    matchScore: 98,
    tags: ["fashion", "bags", "bag", "leather"],
  },
  {
    id: "p_cloud_runner",
    sellerId: "s_daniel",
    title: "Cloud Runner Pro",
    variant: "White / Grey",
    priceSen: 29900,
    imageUrl: "/products/cloud-runner.png",
    matchScore: 95,
    tags: ["shoes", "shoe", "sneakers", "running", "sport"],
  },
  {
    id: "p_elegant_watch",
    sellerId: "s_hana",
    title: "Elegant Watch",
    variant: "Rose Gold",
    priceSen: 25900,
    imageUrl: "/products/elegant-watch.png",
    matchScore: 94,
    tags: ["accessories", "watch", "watches"],
  },
  {
    id: "p_eau_de_luxe",
    sellerId: "s_liyana",
    title: "Eau De Luxe",
    variant: "50ml",
    priceSen: 14900,
    imageUrl: "/products/eau-de-luxe.png",
    matchScore: 93,
    tags: ["beauty", "perfume", "fragrance"],
  },
];

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

const CLIPS: Clip[] = [
  { slug: "scopie-concept", creator: "scopie", caption: "Welcome to Scopie — meet your new digital world ✨", tags: ["Scopie", "NewDigitalWorld"] },
  { slug: "kalima-ai-model", creator: "kalima", caption: "Meet Kalima — AI model, always disclosed ✦", tags: ["AIModel", "AIonScopie"] },
  { slug: "problem-solving", creator: "scopie", caption: "Built to solve real problems 💡", tags: ["BuildWithScopie"] },
  { slug: "batik-modern", creator: "batikdoludolu", caption: "Batik, but make it modern 🌺", tags: ["ModernBatik", "MadeInMY"], products: ["p_luxe_bag"] },
  { slug: "hoor-ugc-1", creator: "hoor", caption: "Get ready with me ✨", tags: ["GRWM", "OOTD"], products: ["p_eau_de_luxe"] },
  { slug: "not-ai-1", creator: "scopie", caption: "Not AI… or is it? ✦", tags: ["SpotTheAvatar"] },
  { slug: "kalima-photoshoot-1", creator: "kalima", caption: "Behind the shoot 📸", tags: ["BTS", "Photoshoot"], products: ["p_elegant_watch"] },
  { slug: "batik-traditional", creator: "batikdoludolu", caption: "Traditional batik, timeless craft", tags: ["Batik", "Heritage"] },
  { slug: "hoor-ugc-2", creator: "hoor", caption: "Everyday fit check 🔥", tags: ["OOTD", "FitCheck"] },
  { slug: "digital-human", creator: "scopie", caption: "Digital humans are here — always disclosed ✦", tags: ["AIonScopie"] },
  { slug: "kalima-ugc-1", creator: "kalima", caption: "Trying this trend 💜", tags: ["Trending"] },
  { slug: "nexova-product-intro", creator: "nexova", caption: "Product intro, done right 🎬", tags: ["ProductLaunch"], products: ["p_cloud_runner"] },
  { slug: "not-ai-2", creator: "scopie", caption: "Real or rendered? 👀 ✦", tags: ["SpotTheAvatar"] },
  { slug: "hoor-ugc-3", creator: "hoor", caption: "You asked, I answered 💬", tags: ["AskMeAnything"] },
  { slug: "kalima-daily-life", creator: "kalima", caption: "A day in my life 🌤", tags: ["DayInMyLife"] },
  { slug: "batik-release", creator: "batikdoludolu", caption: "New release loading… 👀", tags: ["ComingSoon"] },
  { slug: "i-look-real", creator: "scopie", caption: "I look real, don't I? ✦ AI — always labeled", tags: ["SpotTheAvatar"] },
  { slug: "kalima-ugc-2", creator: "kalima", caption: "New drop — who's in? 👀", tags: ["NewDrop"] },
  { slug: "hoor-ugc-4", creator: "hoor", caption: "Little things, big vibes ✨", tags: ["DailyFinds"] },
  { slug: "not-ai-3", creator: "scopie", caption: "Look closer ✦ AI, always disclosed", tags: ["AIonScopie"] },
  { slug: "kalima-photoshoot-2", creator: "kalima", caption: "Golden hour on set ✨", tags: ["GoldenHour"] },
  { slug: "project-based", creator: "scopie", caption: "From idea to launch 🚀", tags: ["Builders"] },
  { slug: "kalima-ugc-3", creator: "kalima", caption: "Weekend mood ✨", tags: ["Weekend"] },
  { slug: "nexova-cinematic", creator: "nexova", caption: "Cinematic mode: ON 🎬", tags: ["CinematicAds"] },
  { slug: "not-ai-4", creator: "scopie", caption: "Blink and you'll miss it ✦", tags: ["SpotTheAvatar"] },
  { slug: "kalima-slow-cut", creator: "kalima", caption: "Slow it down 🎞", tags: ["Cinematic"] },
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
    pinnedProductId: "p_luxe_bag",
    flashDeal: { productId: "p_luxe_bag", discountPct: 10, endsAtStreamMs: 2 * 60 * 60 * 1000 },
  },
  {
    id: "room_aisyah",
    title: "Aisyah — New Drop Try-On",
    hostType: "seller",
    aiDisclosed: true,
    status: "live",
    viewerCount: 430,
    pinnedProductId: null,
    flashDeal: null,
  },
];

/** Live-room sample loop — a self-hosted clip, looped by the player. */
export const DEMO_LIVE_HLS = "/videos/kalima-photoshoot-1.mp4";

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
    return "Yes — 10% off the pinned pick while the timer on screen is running ✨";
  }
  if (/how much|price|cost|berapa|harga/.test(q) && match) {
    return `${match.title} is ${formatRM(match.priceSen)} — tap the card to grab it ✨`;
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
