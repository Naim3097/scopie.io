"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@scopie/core";

/**
 * Client-side cart. The cart is a PROPOSAL — nothing in it commits money;
 * the Scopie Pay confirmation sheet's tap is the authorization (see
 * ARCHITECTURE.md · Agents). Persisted per device in localStorage until the
 * commerce backend owns carts.
 */

export interface CartItem {
  product: Product;
  qty: number;
}

interface CartState {
  items: CartItem[];
  count: number;
  totalSen: number;
  /** Returns false when the cart couldn't take it (line cap / qty cap). */
  add: (product: Product, qty?: number) => boolean;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const LS_CART = "scopie_cart";
export const MAX_LINES = 20;
export const MAX_QTY = 9;

function load(): CartItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_CART) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (x): x is CartItem =>
          typeof x === "object" &&
          x !== null &&
          Number.isFinite((x as CartItem).qty) &&
          typeof (x as CartItem).product === "object" &&
          (x as CartItem).product !== null &&
          typeof (x as CartItem).product.id === "string" &&
          Number.isFinite((x as CartItem).product.priceSen),
      )
      // A tampered/corrupt snapshot must not become "RM NaN" or qty -3.
      .map((x) => ({ ...x, qty: Math.min(MAX_QTY, Math.max(1, Math.floor(x.qty))) }))
      .slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

function persist(items: CartItem[]): void {
  try {
    localStorage.setItem(LS_CART, JSON.stringify(items));
  } catch {
    /* private mode / quota — cart persistence is best-effort */
  }
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  // Mirror for synchronous reads (add() reports whether it changed anything).
  const itemsRef = useRef<CartItem[]>([]);

  // Hydrate after mount — localStorage is unavailable during SSR.
  useEffect(() => {
    const loaded = load();
    itemsRef.current = loaded;
    setItems(loaded);
  }, []);

  const mutate = useCallback((fn: (prev: CartItem[]) => CartItem[]) => {
    setItems((prev) => {
      const next = fn(prev);
      itemsRef.current = next;
      persist(next);
      return next;
    });
  }, []);

  const add = useCallback(
    (product: Product, qty = 1): boolean => {
      const current = itemsRef.current;
      const existing = current.find((i) => i.product.id === product.id);
      // Silent no-ops must be reportable: "Added ✓" over a full cart lies.
      if (!existing && current.length >= MAX_LINES) return false;
      if (existing && existing.qty >= MAX_QTY) return false;
      mutate((prev) => {
        const found = prev.find((i) => i.product.id === product.id);
        if (found) {
          return prev.map((i) =>
            i.product.id === product.id ? { ...i, qty: Math.min(MAX_QTY, i.qty + qty) } : i,
          );
        }
        return [...prev, { product, qty: Math.min(MAX_QTY, Math.max(1, qty)) }].slice(0, MAX_LINES);
      });
      return true;
    },
    [mutate],
  );

  const setQty = useCallback(
    (productId: string, qty: number) => {
      mutate((prev) =>
        qty < 1
          ? prev.filter((i) => i.product.id !== productId)
          : prev.map((i) => (i.product.id === productId ? { ...i, qty: Math.min(MAX_QTY, qty) } : i)),
      );
    },
    [mutate],
  );

  const remove = useCallback(
    (productId: string) => mutate((prev) => prev.filter((i) => i.product.id !== productId)),
    [mutate],
  );

  const clear = useCallback(() => mutate(() => []), [mutate]);

  const value = useMemo<CartState>(() => {
    const count = items.reduce((n, i) => n + i.qty, 0);
    const totalSen = items.reduce((n, i) => n + i.product.priceSen * i.qty, 0);
    return { items, count, totalSen, add, setQty, remove, clear };
  }, [items, add, setQty, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart requires CartProvider");
  return ctx;
}
