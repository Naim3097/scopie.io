import { z } from "zod";

/** Prices are integer sen (RM cents). Never floats. */
export const MoneyMYR = z.object({
  amountSen: z.number().int().nonnegative(),
  currency: z.literal("MYR"),
});
export type MoneyMYR = z.infer<typeof MoneyMYR>;

export const Product = z.object({
  id: z.string(),
  sellerId: z.string(),
  title: z.string(),
  variant: z.string().optional(),
  priceSen: z.number().int().nonnegative(),
  imageUrl: z.string().url().optional(),
  /** Calibrated similarity score for "AI Picks" (0–100). Display-capped. */
  matchScore: z.number().min(0).max(100).optional(),
  tags: z.array(z.string()).default([]),
  /** Price-on-request listing (B2B / regulated financing): price stays 0,
   *  buy actions are replaced by an enquiry note. Never invent figures. */
  enquiryOnly: z.boolean().optional(),
});
export type Product = z.infer<typeof Product>;

export const Video = z.object({
  id: z.string(),
  creatorId: z.string(),
  caption: z.string().default(""),
  hlsUrl: z.string().url(),
  posterUrl: z.string().url().optional(),
  durationMs: z.number().int().positive().optional(),
  hashtags: z.array(z.string()).default([]),
  /** Products tagged on this video (shoppable feed) */
  productIds: z.array(z.string()).default([]),
  stats: z
    .object({ likes: z.number().int(), comments: z.number().int(), shares: z.number().int() })
    .partial()
    .default({}),
});
export type Video = z.infer<typeof Video>;

export const LiveRoom = z.object({
  id: z.string(),
  title: z.string(),
  hostType: z.enum(["seller", "ai"]),
  /** AI hosts are always disclosed in the UI. */
  aiDisclosed: z.boolean().default(true),
  status: z.enum(["scheduled", "live", "ended"]),
  viewerCount: z.number().int().nonnegative().default(0),
  pinnedProductId: z.string().nullable().default(null),
  flashDeal: z
    .object({
      productId: z.string(),
      discountPct: z.number().int().min(1).max(90),
      /** Deals sync to stream position, not wall clock (HLS viewers lag 3–6 s). */
      endsAtStreamMs: z.number().int().nonnegative(),
    })
    .nullable()
    .default(null),
});
export type LiveRoom = z.infer<typeof LiveRoom>;

export const LiveChatMessage = z.object({
  id: z.string(),
  from: z.string(),
  text: z.string(),
  isHost: z.boolean().default(false),
  /** Catalog snapshot attached by the SERVER — prices never come from generated text. */
  product: z
    .object({ id: z.string(), title: z.string(), priceSen: z.number().int().nonnegative() })
    .nullable()
    .default(null),
});
export type LiveChatMessage = z.infer<typeof LiveChatMessage>;

/**
 * Structured commands the live-host agent may emit. The commerce backend
 * re-validates every one server-side — chat text can never reach these directly.
 */
export const HostCommand = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("switch_product"), productId: z.string() }),
  z.object({ kind: z.literal("pin_product"), productId: z.string() }),
  z.object({
    kind: z.literal("start_flash_deal"),
    productId: z.string(),
    discountPct: z.number().int().min(1).max(90),
    durationMs: z.number().int().positive().max(30 * 60 * 1000),
  }),
  z.object({ kind: z.literal("answer_question"), questionId: z.string(), text: z.string().max(600) }),
]);
export type HostCommand = z.infer<typeof HostCommand>;
