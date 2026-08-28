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

// Demo video: third-party test streams (real film content, never test
// patterns). Replaced by Cloudflare Stream-hosted clips in the next phase.
const HLS_A = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const HLS_B = "https://test-streams.mux.dev/tos_ismc/main.m3u8";

export const demoVideos: Video[] = [
  {
    id: "v1",
    creatorId: "Aisyah",
    caption: "New collection drop is finally here! Which one is your favourite?",
    hlsUrl: HLS_A,
    posterUrl: "/posters/poster-a.png",
    hashtags: ["ScopieStyle", "NewDrop", "OOTD"],
    productIds: ["p_luxe_bag"],
    stats: { likes: 1200, comments: 128, shares: 76 },
  },
  {
    id: "v2",
    creatorId: "Daniel",
    caption: "Morning run, clear mind.",
    hlsUrl: HLS_B,
    posterUrl: "/posters/poster-b.png",
    hashtags: ["HealthyMind", "MorningRoutine"],
    productIds: ["p_cloud_runner"],
    stats: { likes: 860, comments: 54, shares: 31 },
  },
  {
    id: "v3",
    creatorId: "Hana",
    caption: "Clean girl aesthetic — 3 pieces, endless looks ✨",
    hlsUrl: HLS_A,
    posterUrl: "/posters/poster-a.png",
    hashtags: ["CleanGirl", "Aesthetic"],
    productIds: ["p_elegant_watch"],
    stats: { likes: 2300, comments: 210, shares: 143 },
  },
  {
    id: "v4",
    creatorId: "Liyana",
    caption: "Travel essentials for your next getaway 🧳",
    hlsUrl: HLS_B,
    posterUrl: "/posters/poster-b.png",
    hashtags: ["TravelEssentials"],
    productIds: ["p_eau_de_luxe"],
    stats: { likes: 990, comments: 87, shares: 40 },
  },
];

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

export const DEMO_LIVE_HLS = HLS_A;

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
