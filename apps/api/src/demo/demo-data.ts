import type { Product, Video, LiveRoom } from "@scopie/core";

/**
 * Demo catalog and feed used whenever real infrastructure (Postgres, Meili,
 * Medusa, LiveKit) is not configured, so the whole stack runs out of the box.
 * Content mirrors the concept screens. HLS URLs are public test streams.
 */

// Image paths resolve against the web origin (self-hosted in apps/web/public).
export const demoProducts: Product[] = [
  {
    id: "p_luxe_bag",
    sellerId: "s_aisyah",
    title: "Luxe Leather Bag",
    variant: "Beige",
    priceSen: 18900,
    imageUrl: "/products/luxe-bag.png",
    matchScore: 98,
    tags: ["fashion", "bags", "bag", "leather", "ootd"],
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

// Self-hosted clips (apps/web/public/videos) — relative URLs resolve
// against the web origin that renders them. No third-party streams.
export const demoVideos: Video[] = [
  {
    id: "v1",
    creatorId: "s_scopie",
    caption: "Welcome to Scopie — meet your new digital world ✨",
    hlsUrl: "/videos/scopie-concept.mp4",
    posterUrl: "/videos/posters/scopie-concept.jpg",
    hashtags: ["Scopie", "NewDigitalWorld"],
    productIds: ["p_luxe_bag"],
    stats: { likes: 1200, comments: 128, shares: 76 },
  },
  {
    id: "v2",
    creatorId: "s_kalima",
    caption: "Meet Kalima — AI model, always disclosed ✦",
    hlsUrl: "/videos/kalima-ai-model.mp4",
    posterUrl: "/videos/posters/kalima-ai-model.jpg",
    hashtags: ["AIModel", "AIonScopie"],
    productIds: ["p_cloud_runner"],
    stats: { likes: 860, comments: 54, shares: 31 },
  },
  {
    id: "v3",
    creatorId: "s_batikdoludolu",
    caption: "Batik, but make it modern 🌺",
    hlsUrl: "/videos/batik-modern.mp4",
    posterUrl: "/videos/posters/batik-modern.jpg",
    hashtags: ["ModernBatik", "MadeInMY"],
    productIds: ["p_elegant_watch"],
    stats: { likes: 2300, comments: 210, shares: 143 },
  },
  {
    id: "v4",
    creatorId: "s_hoor",
    caption: "Get ready with me ✨",
    hlsUrl: "/videos/hoor-ugc-1.mp4",
    posterUrl: "/videos/posters/hoor-ugc-1.jpg",
    hashtags: ["GRWM", "OOTD"],
    productIds: ["p_eau_de_luxe"],
    stats: { likes: 990, comments: 87, shares: 40 },
  },
];

export const demoLiveRooms: LiveRoom[] = [
  {
    id: "room_scopie_live",
    title: "Scopie Live — Today's Picks",
    hostType: "ai",
    aiDisclosed: true,
    status: "live",
    viewerCount: 1200,
    pinnedProductId: "p_luxe_bag",
    flashDeal: {
      productId: "p_luxe_bag",
      discountPct: 10,
      endsAtStreamMs: 2 * 60 * 60 * 1000,
    },
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
