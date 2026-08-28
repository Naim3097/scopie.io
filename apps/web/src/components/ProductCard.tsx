"use client";

import type { Product } from "@scopie/core";
import { useCommerce, type Surface } from "@/components/commerce/Commerce";
import { formatRM } from "@/lib/demo";

/**
 * Product card. Tapping the card opens the product sheet; "Buy now" jumps
 * straight to the Scopie Pay confirmation sheet — either way, money only
 * moves on the confirmation tap (never from a card).
 */
export function ProductCard({ product, surface = "discover" }: { product: Product; surface?: Surface }) {
  const { openProduct, buyNow } = useCommerce();

  return (
    <div className="card">
      <button className="card-tap" onClick={() => openProduct(product, surface)} aria-label={`View ${product.title}`}>
        {product.imageUrl && <img src={product.imageUrl} alt="" loading="lazy" />}
        <span className="card-body" style={{ display: "block", paddingBottom: 0 }}>
          {typeof product.matchScore === "number" && (
            <span className="match">
              <span aria-hidden="true">✦</span> {product.matchScore}% Match
            </span>
          )}
          <span className="card-title" style={{ display: "block" }}>
            {product.title}
          </span>
          {product.variant && (
            <span className="card-variant" style={{ display: "block" }}>
              {product.variant}
            </span>
          )}
          <span className="card-price" style={{ display: "block" }}>
            {formatRM(product.priceSen)}
          </span>
        </span>
      </button>
      <div className="card-body" style={{ paddingTop: 8 }}>
        <button
          className="btn btn-primary"
          style={{ padding: "11px 16px", fontSize: 14, whiteSpace: "nowrap" }}
          onClick={() => buyNow(product, surface)}
        >
          Buy now
        </button>
      </div>
    </div>
  );
}
