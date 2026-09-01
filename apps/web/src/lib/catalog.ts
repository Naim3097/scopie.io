import type { Product } from "@scopie/core";

/**
 * The real client catalog, migrated from the first Scopie MVP (nexova-app).
 * Every price with a number is literal in the merchant's own materials
 * (nexova-app/src/lib/data/merchants-real*.ts, themselves traced to each
 * client's repo under "nexova AI/reference/<client>"). Price-on-request
 * businesses (Tropicor B2B, both licensed credit companies) use
 * `enquiryOnly` — no invented figures, per the AI-grounding rule.
 * Product ids are stable — they key carts, deep links and events.
 */

export interface DemoSeller {
  name: string;
  tagline: string;
  logoUrl?: string;
  verified: boolean;
}

export const demoSellers: Record<string, DemoSeller> = {
  hoor: { name: "HOOR", tagline: "the most beautiful · Batik Dolu-Dolu", logoUrl: "/brand/hoor-logo.svg", verified: true },
  kalima: { name: "Kalima", tagline: "Modest wear, made effortless", verified: true },
  sugarbomb: { name: "Sugarbomb", tagline: "Bold Malaysian fragrance", logoUrl: "/brand/sugarbomb-logo.png", verified: true },
  byki: { name: "BYKI", tagline: "Know your car — free OBD2 scan in your browser", verified: true },
  belum: { name: "Belum.my", tagline: "Royal Belum houseboat escapes", verified: true },
  tongrorobin: { name: "TongRoroBin", tagline: "Sewa tong roro — hantar & kutip", verified: true },
  konbinio: { name: "Konbinio", tagline: "Your 24/7 neighbourhood konbini", verified: true },
  maelburger: { name: "It's Mael Burger", tagline: "Smashed fresh to order", logoUrl: "/brand/mael-logo.webp", verified: true },
  jomkaki: { name: "JomKaki Motor", tagline: "The ride you want — one message away", logoUrl: "/brand/jomkaki-logo.png", verified: true },
  glimsy: { name: "Glimsy × Amanina", tagline: "Follow her style. Shop her closet.", verified: true },
  bina: { name: "BINA+ Design & Build", tagline: "Homes built with intention", logoUrl: "/brand/bina-logo.webp", verified: true },
  benefigs: { name: "Benefigs", tagline: "Good Figs, Good Life", logoUrl: "/brand/benefigs-logo.svg", verified: true },
  tropicor: { name: "Tropicor Foods", tagline: "Inspired by Tradition, Driven by Taste", logoUrl: "/brand/tropicor-logo.webp", verified: true },
  firstclasscredit: { name: "First Class Credit", tagline: "Your Financing, Our Priority", logoUrl: "/brand/fcc-logo.webp", verified: true },
  factorycredit: { name: "Factory Credit", tagline: "Pinjaman Peribadi Patuh Syariah", logoUrl: "/brand/factorycredit-logo.webp", verified: true },
  ombakdamai: { name: "Ombak Damai", tagline: "Private homestay by the sea — Penarik", logoUrl: "/brand/ombak-logo.webp", verified: true },
};

const p = (
  id: string,
  sellerId: string,
  title: string,
  variant: string | undefined,
  priceSen: number,
  imageUrl: string | undefined,
  tags: string[],
  extra?: Partial<Product>,
): Product => ({ id, sellerId, title, variant, priceSen, imageUrl, tags, ...extra });

/* HOOR — Batik Dolu-Dolu kaftans, RM199 each (hoor.my). */
const hoorTags = ["fashion", "kaftan", "batik", "dress", "baju", "modest", "raya"];
const hoor = (id: string, name: string, colourway: string, img: string, extra?: Partial<Product>): Product =>
  p(id, "hoor", `HOOR ${name} Kaftan`, `${colourway} · Batik Dolu-Dolu · S–XXL`, 19900, `/products/hoor/${img}`, hoorTags, extra);

/* Kalima — modest wear (kalima.my). */
const kalimaTags = ["fashion", "modest", "kalima"];

/* Sugarbomb — Malaysian fragrance house (shop prices incl. genuine sale pairs). */
const sb = (id: string, name: string, collection: string, priceSen: number, img: string, extra?: Partial<Product>): Product =>
  p(id, "sugarbomb", `Sugarbomb ${name}`, `${collection} · extrait de parfum`, priceSen, `/products/sugarbomb/${img}`, ["beauty", "perfume", "fragrance", "scent", "minyak wangi"], extra);

/* Belum.my — whole-houseboat charters on Tasik Temenggor. */
const belum = (id: string, name: string, variant: string, priceSen: number, img: string, extra?: Partial<Product>): Product =>
  p(id, "belum", name, variant, priceSen, `/products/belum/${img}`, ["travel", "houseboat", "belum", "trip", "percutian", "fishing", "family"], extra);

/* Konbinio — 24/7 konbini (prices from their own product data). */
const kb = (id: string, name: string, unit: string, priceSen: number, img?: string): Product =>
  p(id, "konbinio", `Konbinio ${name}`, unit, priceSen, img ? `/products/konbinio/${img}` : undefined, ["groceries", "food", "snack", "konbini", "makan"]);

/* It's Mael Burger — smashburgers, Klang Valley (menu prices). */
const mael = (id: string, name: string, priceSen: number): Product =>
  p(id, "maelburger", `Mael Burger — ${name}`, "Smashed fresh to order · Halal", priceSen, undefined, ["food", "burger", "smash", "halal", "makan", "delivery"]);

/* JomKaki Motor — bikes, gear & the Kuching iPhone counter (indicative pricing). */
const jom = (id: string, name: string, variant: string, priceSen: number, tags: string[], img?: string): Product =>
  p(id, "jomkaki", `JomKaki — ${name}`, variant, priceSen, img, tags);

/* Glimsy × Amanina Zakaria — creator closet. Their repo prices are IDR-only,
   so RM figures are PREVIEW pricing pending the merchant's list — and the
   variant says so on every card (honesty rule). */
const gl = (id: string, name: string, badge: string, priceSen: number, img?: string): Product =>
  p(id, "glimsy", name, `${badge} · preview pricing`, priceSen, img ? `/products/glimsy/${img}` : undefined, ["fashion", "hijab", "modest", "creator", "preloved"]);

/* BINA+ — fixed-scope design & build ("from" pricing, free site visit). */
const bina = (id: string, name: string, variant: string, priceSen: number, img: string): Product =>
  p(id, "bina", name, variant, priceSen, `/products/bina/${img}`, ["home", "renovation", "build", "interior", "rumah"]);

/* Benefigs — MyGAP fig farms (benefigs.my prices). */
const fig = (id: string, name: string, variant: string, priceSen: number): Product =>
  p(id, "benefigs", `Benefigs — ${name}`, variant, priceSen, undefined, ["groceries", "figs", "buah", "tin", "fresh", "healthy"]);

/* Tropicor Foods — B2B food manufacturing: price on request, never invented. */
const trop = (id: string, name: string, variant: string, img: string): Product =>
  p(id, "tropicor", name, `${variant} · Halal (JAKIM) · GMP · MESTI`, 0, `/products/tropicor/${img}`, ["groceries", "b2b", "seasoning", "food", "manufacturer"], { enquiryOnly: true });

export const demoProducts: Product[] = [
  /* ── HOOR ── */
  hoor("hoor-pusaka", "PUSAKA", "Deep Teal", "pusaka-deep-teal.webp", { matchScore: 97 }),
  hoor("hoor-senja", "SENJA", "Midnight", "senja-midnight.webp"),
  hoor("hoor-semarak", "SEMARAK", "Maroon Rose", "semarak-maroon-rose.webp"),
  hoor("hoor-renda-camel", "RENDA", "Camel Gold", "renda-camel-gold.webp"),
  hoor("hoor-renda-indigo", "RENDA", "Indigo", "renda-indigo.webp"),
  hoor("hoor-rimbun", "RIMBUN", "Cocoa", "rimbun-cocoa.webp"),
  hoor("hoor-anggerik", "ANGGERIK", "Lilac", "anggerik-lilac.webp"),

  /* ── Kalima ── */
  p("kalima-chiffon-shawl", "kalima", "Kalima Italian Chiffon Shawl", "9 colours · opaque matte", 5900, "/products/kalima/italian-chiffon-shawl-emerald.webp", [...kalimaTags, "shawl", "tudung", "hijab"]),
  p("kalima-kurta-zaid", "kalima", "Kalima Kurta Zaid — Men's", "6 colours · S–XXL", 9900, "/products/kalima/kurta-zaid-brick.webp", [...kalimaTags, "kurta", "men", "lelaki", "raya"]),
  p("kalima-kurta-yasir", "kalima", "Kalima Kurta Yasir — Men's", "6 colours · premium weight", 12500, "/products/kalima/kurta-yasir-navy.webp", [...kalimaTags, "kurta", "men", "lelaki", "raya"]),
  p("kalima-anna-top", "kalima", "Kalima Anna Top", "8 garden-floral prints", 13000, "/products/kalima/anna-top-dreamy-garden.webp", [...kalimaTags, "top", "blouse", "floral"]),
  p("kalima-luna-palazo", "kalima", "Kalima Luna Palazo", "5 colours · high waist", 17000, "/products/kalima/luna-palazo-maroon.webp", [...kalimaTags, "palazzo", "pants", "seluar"]),
  p("kalima-danisya-set", "kalima", "Kalima Danisya Set", "Premium satin · 9 colours", 20000, "/products/kalima/danisya-set-teal-green.webp", [...kalimaTags, "set", "satin", "two-piece"]),
  p("kalima-anaya-cotton", "kalima", "Kalima Anaya Cotton Set", "100% cotton two-piece · 2 prints", 20000, undefined, [...kalimaTags, "set", "cotton", "two-piece"]),
  p("kalima-ruwa-caftan", "kalima", "Kalima Ruwa Caftan", "Premium satin · 8 colours", 25000, "/products/kalima/ruwa-caftan-burgundy.webp", [...kalimaTags, "caftan", "kaftan", "satin", "majlis"], { matchScore: 96 }),
  p("kalima-serra-scallop", "kalima", "Kalima Serra Scallop Abaya", "Cardigan + satin inner · 7 colours", 39500, "/products/kalima/serra-scallop-teal-green.webp", [...kalimaTags, "abaya", "scallop", "nursing"]),

  /* ── Sugarbomb ── */
  // List price is the merchant's own RM45.90 (their shop shows the RM39.90
  // sale as a pair) — the drop engine delivers the genuine sale price.
  sb("sugarbomb-hush-lush", "Hush Lush", "Luscious Collection", 4590, "hush-lush.webp", { matchScore: 98 }),
  sb("sugarbomb-midnight-oud", "Midnight Oud", "Eternal Collection", 5990, "eternal.webp"),
  sb("sugarbomb-ocean-breeze", "Ocean Breeze", "Blast Sports", 3490, "blast.webp"),
  sb("sugarbomb-velvet-rose", "Velvet Rose", "Luscious Collection", 4590, "luscious.webp"),
  sb("sugarbomb-sweet-cherry", "Sweet Cherry", "SB Parfum", 5990, "luscious.webp"),
  sb("sugarbomb-dark-phantom", "Dark Phantom", "Secretscent", 4990, "eternal.webp"),
  sb("sugarbomb-fresh-linen", "Fresh Linen", "Home & Car", 1990, "home-car.webp"),
  sb("sugarbomb-tropical-kiss", "Tropical Kiss", "Luscious Collection", 4590, "luscious.webp"),
  sb("sugarbomb-golden-dusk", "Golden Dusk", "Eternal Collection", 5990, "eternal.webp"),

  /* ── BYKI ── */
  p("byki-obd2-kit", "byki", "BYKI OBD2 Bluetooth Adapter Kit", "Works with the free BYKI web app", 6500, "/products/byki/obd2-adapter.webp", ["gadgets", "car", "kereta", "obd2", "scanner", "diagnostics"], { matchScore: 95 }),

  /* ── Belum.my ── */
  belum("belum-blue-fern-2d1n", "Blue Fern Houseboat — 2D1N", "Private charter · up to 16 pax", 320000, "blue-fern-2d1n.webp", { matchScore: 94 }),
  belum("belum-casuarina-2d1n", "Casuarina Eco Boat — 2D1N", "Community & nature · up to 20 pax", 280000, "casuarina-2d1n.webp"),
  belum("belum-rainforest-2d1n", "Rainforest Explorer — 2D1N", "Adventure cruise · up to 18 pax", 320000, "rainforest-2d1n.webp"),
  belum("belum-star-3d2n", "Belum Star — 3D2N Family Explorer", "Child-safe · up to 22 pax", 480000, "belum-star-3d2n.webp"),
  belum("belum-angler-2d1n", "The Angler — 2D1N Fishing Trip", "Pro gear + fish finder · up to 14 pax", 380000, "angler-2d1n.webp"),
  belum("belum-rainforest-4d3n", "Deep Expedition — 4D3N", "Remote camps · up to 18 pax", 780000, "rainforest-4d3n.webp"),

  /* ── TongRoroBin ── */
  p("tongro-kecil", "tongrorobin", "Sewa Tong Roro Kecil", "2×6×12 kaki · hantar & kutip termasuk", 24500, "/products/tongro/tong-kecil.webp", ["home", "roro", "bin", "renovation", "sisa", "sewa"]),
  p("tongro-sederhana", "tongrorobin", "Sewa Tong Roro Sederhana", "4×6×12 kaki · hantar & kutip termasuk", 35000, "/products/tongro/tong-sederhana.webp", ["home", "roro", "bin", "renovation", "sisa", "sewa"]),
  p("tongro-besar", "tongrorobin", "Sewa Tong Roro Besar", "5×6×12 kaki · hantar & kutip termasuk", 49000, "/products/tongro/tong-besar.webp", ["home", "roro", "bin", "renovation", "sisa", "sewa"]),

  /* ── Konbinio ── */
  kb("konbinio-teriyaki-bento", "Chicken Teriyaki Bento", "320g", 1290, "chicken-teriyaki-bento.webp"),
  kb("konbinio-salmon-onigiri", "Salmon Onigiri", "110g", 450, "salmon-onigiri.webp"),
  kb("konbinio-curry-puff", "Curry Puff", "1 pc", 250, "curry-puff.webp"),
  kb("konbinio-iced-latte", "Iced Latte Can", "240ml", 590, "iced-latte-can.webp"),
  kb("konbinio-pocky", "Pocky Sticks", "47g", 550, "pocky-sticks.webp"),
  kb("konbinio-nasi-lemak", "Nasi Lemak Pack", "250g", 750),
  kb("konbinio-matcha-latte", "Matcha Latte", "300ml", 650),

  /* ── It's Mael Burger ── */
  mael("mael-classic", "Mael Classic", 1890),
  mael("mael-cheezy", "Mael Cheezy", 2390),
  mael("mael-spicy", "Mael Spicy", 2090),
  mael("mael-triple-trouble", "Triple Trouble", 2890),
  mael("mael-chick", "Mael Chick", 1790),
  mael("mael-classic-combo", "Classic Combo", 2690),
  mael("mael-loaded-fries", "Loaded Fries", 1390),
  mael("mael-cookie-shake", "Cookie Crumble Shake", 990),
  mael("mael-duo-box", "Duo Box — For Two", 5290),

  /* ── JomKaki Motor ── */
  jom("jomkaki-y15zr", "Yamaha Y15ZR", "150cc kapcai · 2026 · 3 colours", 899800, ["motor", "motosikal", "yamaha", "kapcai", "bike"]),
  jom("jomkaki-nvx155", "Yamaha NVX 155", "155cc scooter · keyless · 2026", 1159800, ["motor", "motosikal", "yamaha", "scooter", "bike"]),
  jom("jomkaki-lc135", "Yamaha LC135", "135cc kapcai · 2026", 749800, ["motor", "motosikal", "yamaha", "kapcai", "bike"]),
  jom("jomkaki-rs150r", "Honda RS150R", "150cc DOHC · 6-speed · 2026", 879900, ["motor", "motosikal", "honda", "kapcai", "bike"]),
  jom("jomkaki-ex5", "Honda EX5", "110cc kapcai · legendary economy", 489900, ["motor", "motosikal", "honda", "kapcai", "bike"]),
  jom("jomkaki-kyt-helmet", "KYT TT-Course Helmet", "Full-face · SIRIM & DOT · L–XXL", 78000, ["motor", "helmet", "gear", "safety"]),
  jom("jomkaki-yamalube", "Yamalube Power 10W-40", "1.0L semi-synthetic · API SL", 3800, ["motor", "oil", "minyak", "service"]),
  jom("jomkaki-iphone-17", "iPhone 17 (Kuching)", "256/512GB · Satok collection only", 399900, ["gadgets", "iphone", "apple", "phone", "kuching"], "/products/jomkaki/iphone-17.webp"),

  /* ── Glimsy × Amanina ── */
  gl("glimsy-instant-hijab", "Glimsy Daily Instant Hijab", "Best Seller · jersey, no pinning", 2500),
  gl("glimsy-hijab-scarf", "Glimsy Printed Hijab Scarf", "Preloved · neutral tones", 2900, "printed-hijab-scarf.webp"),
  gl("glimsy-knit-top", "Glimsy Café Knit Top", "Sale pick · relaxed fit", 3500, "cafe-knit-top.webp"),
  gl("glimsy-blouse", "Glimsy Dinner Date Blouse", "Creator Pick · soft structure", 4900, "dinner-date-blouse.webp"),
  gl("glimsy-wide-pants", "Glimsy Linen Wide Pants", "Everyday Pick · breathable", 5500, "linen-wide-pants.webp"),
  gl("glimsy-midi-skirt", "Glimsy Satin Midi Skirt", "Reel favourite · fluid drape", 5900, "satin-midi-skirt.webp"),

  /* ── BINA+ ── */
  bina("bina-id-start", "BINA+ ID START — Interior Design", "Melamine series · ~650 sqft · from", 3900000, "id-start.webp"),
  bina("bina-id-plus", "BINA+ ID PLUS — Interior Design", "Laminated series · ~1,000 sqft · from", 5900000, "id-plus.webp"),
  bina("bina-start", "BINA START — New Build", "Single-storey · 3 bed 2 bath · from", 20000000, "bina-start.webp"),
  bina("bina-plus", "BINA PLUS — New Build", "1.5-storey · ~1,500 sqft · from", 35000000, "bina-plus.webp"),
  bina("bina-max", "BINA MAX — New Build", "Double-storey · 4 bed 3 bath · from", 46000000, "bina-max.webp"),
  bina("bina-reno-plus", "BINA+ RENO PLUS — Extension", "Full two-storey extension · from", 20000000, "reno-plus.webp"),

  /* ── Benefigs ── */
  fig("benefigs-masui", "Buah Tin Segar Masui Dauphine", "Bekas 300g · ±6–9 biji", 2000),
  fig("benefigs-constantine", "Buah Tin Segar Constantine", "Bekas 300g · ±5–8 biji", 2200),
  fig("benefigs-kering", "Buah Tin Kering", "100g · tiada gula tambahan", 2890),
  fig("benefigs-anak-pokok", "Anak Pokok Tin Masui", "Siap panduan menanam", 5500),
  fig("benefigs-pakej-3", "Pakej Permulaan 3 Anak Pokok", "Jimat RM25", 11000),
  fig("benefigs-jem", "Jem Buah Tin", "Balang 150g", 1800),
  fig("benefigs-teh", "Teh Daun Tin", "30g · tanpa kafein", 2990),
  fig("benefigs-hamper", "Hamper Kesihatan Benefigs", "Raya & korporat", 12000),
  fig("benefigs-sambal", "Sambal Buah Tin", "Balang 200g · pedas sederhana", 1800),
  fig("benefigs-kotak-campuran", "Kotak Buah Tin Premium Campuran", "±600g · bermusim", 4500),

  /* ── Tropicor Foods (B2B — price on request) ── */
  trop("tropicor-umamite", "FEEGOH Umamite Yeast Extract Spread", "200g & 420g bottles", "umamite.webp"),
  trop("tropicor-chicken-stock", "FEEGOH Chicken Stock", "300g & 1kg packs", "chicken-stock.webp"),
  trop("tropicor-ikan-bilis", "FEEGOH Ikan Bilis Seasoning", "300g & 1kg packs", "ikan-bilis.webp"),
  trop("tropicor-cukup-enak", "FEEGOH Cukup Enak Seasoning", "300g & 1kg packs", "cukup-enak.webp"),
  trop("tropicor-brown-sauce", "FEEGOH Brown Sauce", "Demi-glace base · 300g & 1kg", "brown-sauce.webp"),
  trop("tropicor-calamansi", "Tropicor Calamansi Puree", "1 litre · 180 real fruits", "calamansi-puree.webp"),

  /* ── First Class Credit & Factory Credit (regulated — enquiry only) ── */
  p("fcc-motorcycle-hp", "firstclasscredit", "Motorcycle Hire Purchase Financing", "Fixed 10% p.a. flat · 12–60 months · HP Act 1967", 0, "/products/fcc/motorcycle-hp.webp", ["digital", "financing", "loan", "motor", "hp"], { enquiryOnly: true }),
  p("fcc-smartphone-hp", "firstclasscredit", "Smartphone Hire Purchase Financing", "RM3k–10k range · 12–36 months", 0, "/products/fcc/smartphone-hp.webp", ["digital", "financing", "loan", "phone", "hp"], { enquiryOnly: true }),
  p("factorycredit-personal", "factorycredit", "Pinjaman Peribadi Patuh Syariah", "RM1k–50k · 12–60 bulan · lesen KPKT", 0, "/brand/factorycredit-logo.webp", ["digital", "financing", "pinjaman", "loan", "syariah"], { enquiryOnly: true }),

  /* ── Ombak Damai ── */
  p("ombak-weeknight", "ombakdamai", "Ombak Damai — Weeknight Stay", "Sun–Thu · whole house · sleeps 8", 48000, "/products/ombak/signage.webp", ["travel", "homestay", "beach", "pantai", "terengganu", "penarik"]),
  p("ombak-weekend", "ombakdamai", "Ombak Damai — Weekend Stay", "Fri–Sat · whole house · sleeps 8", 58000, "/products/ombak/signage.webp", ["travel", "homestay", "beach", "pantai", "terengganu", "penarik"]),
];

export const sellerOf = (product: Product): DemoSeller | undefined => demoSellers[product.sellerId];
