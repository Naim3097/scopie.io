"use client";

import type { Product } from "@scopie/core";
import { API_BASE, DEMO_MODE } from "./api";
import { getAuthHeaders } from "./supabase";

export interface SellerProfile {
  id: string;
  shopName: string;
  status: "pending" | "active" | "suspended";
}
export interface SellerOrder {
  orderId: string;
  productId: string | null;
  amountSen: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
}
export interface NewProduct {
  title: string;
  variant?: string;
  priceSen: number;
  imageUrl?: string;
  tags: string[];
}

/**
 * Seller-centre data layer. On the live demo site (no API) it persists to
 * localStorage so the whole flow is demonstrable; with the API deployed it
 * calls the authenticated /v1/seller endpoints. One interface, two backends.
 */

// ── demo (localStorage) backend ─────────────────────────────────────
const LS_SELLER = "scopie_demo_seller";
const LS_PRODUCTS = "scopie_demo_products";

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — demo persistence is best-effort */
  }
}

function demoOrdersFor(products: Product[]): SellerOrder[] {
  // Illustrative orders so the Orders tab and payable balance demo well:
  // one to ship, one shipped, one delivered (feeds the balance stat).
  const states = ["unfulfilled", "shipped", "delivered"] as const;
  return products.slice(0, 3).map((p, i) => ({
    orderId: `demo-order-${i}`,
    productId: p.id,
    amountSen: p.priceSen,
    paymentStatus: "paid",
    fulfillmentStatus: states[i] ?? "delivered",
    createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
  }));
}

// ── API backend ─────────────────────────────────────────────────────
async function apiCall<T>(path: string, init: RequestInit, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(await getAuthHeaders()), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

// ── public API ──────────────────────────────────────────────────────
export async function getSeller(): Promise<SellerProfile | null> {
  if (DEMO_MODE) return lsGet<SellerProfile | null>(LS_SELLER, null);
  const { seller } = await apiCall<{ seller: SellerProfile | null }>("/v1/seller/me", {}, { seller: null });
  return seller;
}

export async function onboardSeller(shopName: string): Promise<SellerProfile | null> {
  if (DEMO_MODE) {
    const seller: SellerProfile = { id: "demo", shopName: shopName.trim(), status: "active" };
    lsSet(LS_SELLER, seller);
    return seller;
  }
  const { seller } = await apiCall<{ seller: SellerProfile | null }>(
    "/v1/seller/onboard",
    { method: "POST", body: JSON.stringify({ shopName }) },
    { seller: null },
  );
  return seller;
}

export async function listSellerProducts(): Promise<Product[]> {
  if (DEMO_MODE) return lsGet<Product[]>(LS_PRODUCTS, []);
  const { products } = await apiCall<{ products: Product[] }>("/v1/seller/products", {}, { products: [] });
  return products;
}

export async function addSellerProduct(input: NewProduct): Promise<Product | null> {
  if (DEMO_MODE) {
    const products = lsGet<Product[]>(LS_PRODUCTS, []);
    const product: Product = {
      id: `demo_${Date.now()}`,
      sellerId: "demo",
      title: input.title,
      variant: input.variant,
      priceSen: input.priceSen,
      imageUrl: input.imageUrl,
      tags: input.tags,
    };
    lsSet(LS_PRODUCTS, [product, ...products]);
    return product;
  }
  const { product } = await apiCall<{ product: Product | null }>(
    "/v1/seller/products",
    { method: "POST", body: JSON.stringify(input) },
    { product: null },
  );
  return product;
}

export async function listSellerOrders(): Promise<SellerOrder[]> {
  if (DEMO_MODE) return demoOrdersFor(lsGet<Product[]>(LS_PRODUCTS, []));
  const { orders } = await apiCall<{ orders: SellerOrder[] }>("/v1/seller/orders", {}, { orders: [] });
  return orders;
}

export async function shipOrder(orderId: string): Promise<boolean> {
  if (DEMO_MODE) return true; // illustrative in demo mode
  const res = await apiCall<{ status?: string }>(
    `/v1/seller/orders/${orderId}/ship`,
    { method: "POST", body: JSON.stringify({}) },
    {},
  );
  return res.status === "shipped";
}

export async function getSellerBalanceSen(): Promise<number> {
  if (DEMO_MODE) {
    // Demo balance: sum of "delivered" illustrative orders, net of 8% commission.
    return demoOrdersFor(lsGet<Product[]>(LS_PRODUCTS, []))
      .filter((o) => o.fulfillmentStatus === "delivered")
      .reduce((sum, o) => sum + Math.floor(o.amountSen * 0.92), 0);
  }
  const { payableSen } = await apiCall<{ payableSen: number }>("/v1/seller/balance", {}, { payableSen: 0 });
  return payableSen;
}
