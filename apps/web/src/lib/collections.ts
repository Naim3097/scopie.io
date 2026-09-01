import type { Product } from "@scopie/core";
import { demoProducts } from "./catalog";

/**
 * Curated cross-brand edits — the seasonal wedge. A collection is
 * merchandising, not inventory: real products from real brands, arranged
 * around a moment Malaysians already shop for. Raya first; the shape
 * carries to Merdeka, 11.11, year-end.
 */

export interface Collection {
  id: string;
  title: string;
  tagline: string;
  /** Ordered — the first few carry the rail. */
  productIds: string[];
}

export const RAYA_EDIT: Collection = {
  id: "raya-edit",
  title: "The Raya Edit",
  tagline: "Baju, wangian & the open house — one curated raya, across the brands you know.",
  productIds: [
    "kalima-ruwa-caftan",
    "hoor-pusaka",
    "kalima-kurta-zaid",
    "sugarbomb-hush-lush",
    "hoor-senja",
    "kalima-danisya-set",
    "sugarbomb-midnight-oud",
    "hoor-anggerik",
    "kalima-serra-scallop",
    "kalima-chiffon-shawl",
  ],
};

export function collectionProducts(c: Collection): Product[] {
  return c.productIds
    .map((id) => demoProducts.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p));
}
