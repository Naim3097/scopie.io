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
        <span className="card-body">
          <span className="card-title">{product.title}</span>
          {product.variant && <span className="card-variant">{product.variant}</span>}
          <span className="card-price num">
            {product.enquiryOnly ? "On request" : formatRM(product.priceSen)}
          </span>
        </span>
      </button>
      <div className="card-foot">
        {product.enquiryOnly ? (
          <button className="btn btn-ghost btn--compact" onClick={() => openProduct(product, surface)}>
            View details
          </button>
        ) : (
          <button className="btn btn-ghost btn--compact btn--buy" onClick={() => buyNow(product, surface)}>
            Buy now
          </button>
        )}
      </div>
    </div>
  );
}
