import type { Product, Video, LiveRoom } from "@scopie/core";

/**
 * Demo catalog and feed used whenever real infrastructure (Postgres, Meili,
 * Medusa, LiveKit) is not configured, so the whole stack runs out of the box.
 * Content mirrors the concept screens. HLS URLs are public test streams.
 */

export const demoProducts: Product[] = [
  {
    id: "p_luxe_bag",
    sellerId: "s_aisyah",
    title: "Luxe Leather Bag",
    variant: "Beige",
    priceSen: 18900,
    imageUrl: "https://placehold.co/480x480/EDEDF7/5556D6?text=Luxe+Bag",
    matchScore: 98,
    tags: ["fashion", "bags", "ootd"],
  },
  {
    id: "p_cloud_runner",
    sellerId: "s_daniel",
    title: "Cloud Runner Pro",
    variant: "White / Grey",
    priceSen: 29900,
    imageUrl: "https://placehold.co/480x480/EDEDF7/5556D6?text=Cloud+Runner",
    matchScore: 95,
    tags: ["shoes", "sport"],
  },
  {
    id: "p_elegant_watch",
    sellerId: "s_hana",
    title: "Elegant Watch",
    variant: "Rose Gold",
    priceSen: 25900,
    imageUrl: "https://placehold.co/480x480/EDEDF7/5556D6?text=Watch",
    matchScore: 94,
    tags: ["accessories"],
  },
  {
    id: "p_eau_de_luxe",
    sellerId: "s_liyana",
    title: "Eau De Luxe",
    variant: "50ml",
    priceSen: 14900,
    imageUrl: "https://placehold.co/480x480/EDEDF7/5556D6?text=Eau+De+Luxe",
    matchScore: 93,
    tags: ["beauty", "fragrance"],
  },
];

const HLS_A = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const HLS_B = "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8";

export const demoVideos: Video[] = [
  {
    id: "v1",
    creatorId: "s_aisyah",
    caption: "New collection drop is finally here! Which one is your favourite? #ScopieStyle #NewDrop #OOTD",
    hlsUrl: HLS_A,
    hashtags: ["ScopieStyle", "NewDrop", "OOTD"],
    productIds: ["p_luxe_bag"],
    stats: { likes: 1200, comments: 128, shares: 76 },
  },
  {
    id: "v2",
    creatorId: "s_daniel",
    caption: "Morning run, clear mind. #HealthyMind #MorningRoutine",
    hlsUrl: HLS_B,
    hashtags: ["HealthyMind", "MorningRoutine"],
    productIds: ["p_cloud_runner"],
    stats: { likes: 860, comments: 54, shares: 31 },
  },
  {
    id: "v3",
    creatorId: "s_hana",
    caption: "Clean girl aesthetic — 3 pieces, endless looks ✨",
    hlsUrl: HLS_A,
    hashtags: ["CleanGirl", "Aesthetic"],
    productIds: ["p_elegant_watch"],
    stats: { likes: 2300, comments: 210, shares: 143 },
  },
  {
    id: "v4",
    creatorId: "s_liyana",
    caption: "Travel essentials for your next getaway 🧳",
    hlsUrl: HLS_B,
    hashtags: ["TravelEssentials"],
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
