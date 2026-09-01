"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@scopie/core";
import { HelmetMark } from "@/components/Brand";
import { demoProducts, demoSellers, formatRM } from "@/lib/demo";
import { aiHostOf } from "@/lib/hosts";

/**
 * The white-label host widget — a business's named AI host (<business>.ai)
 * as an embeddable surface for THEIR OWN site. This is the widget the
 * /embed/[sellerId] route serves and the /brands page demos live inside a
 * mock storefront. Scoped hard to one seller's catalog: hoor.ai never
 * recommends someone else's perfume.
 */

interface Msg {
  from: "you" | "host";
  text: string;
  product?: Product | null;
}

/** Seller-scoped mirror of the demo host brain (lib/demo.ts patterns). */
function scopedReply(question: string, sellerId: string): Msg {
  const q = question.toLowerCase();
  const mine = demoProducts.filter((p) => p.sellerId === sellerId);
  const words = q.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const match =
    mine.find((p) => words.some((w) => p.title.toLowerCase().includes(w) || p.tags.some((t) => t.includes(w) || w.includes(t)))) ??
    mine[0] ??
    null;

  if (/ship|delivery|deliver|pos|penghantaran|arrive/.test(q)) {
    return { from: "host", text: "Delivery is shown at checkout before you pay — nothing is charged until you confirm." };
  }
  if (/how much|price|cost|berapa|harga/.test(q) && match) {
    return match.enquiryOnly
      ? { from: "host", text: `${match.title} is quoted per order — we'll confirm pricing directly.`, product: match }
      : { from: "host", text: `${match.title} is ${formatRM(match.priceSen)}.`, product: match };
  }
  if (/size|saiz|fit|colour|color|warna/.test(q) && match) {
    return {
      from: "host",
      text: match.variant ? `This one comes as ${match.variant}.` : `All options for ${match.title} are on the card.`,
      product: match,
    };
  }
  if (match) {
    return {
      from: "host",
      text: `${match.title}${match.enquiryOnly ? "" : ` — ${formatRM(match.priceSen)}`}.`,
      product: match,
    };
  }
  return { from: "host", text: "Ask me about any product, price or size." };
}

const SUGGESTIONS = ["Berapa harga?", "What sizes?", "Delivery?"];

export function HostWidget({ sellerId }: { sellerId: string }) {
  const seller = demoSellers[sellerId];
  const host = aiHostOf(sellerId);
  const [messages, setMessages] = useState<Msg[]>(() => [
    { from: "host", text: `I'm ${host} — ask me about ${seller?.name ?? "our"} products.` },
  ]);
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  if (!seller) return null;

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setDraft("");
    setMessages((m) => [...m, { from: "you" as const, text: clean }].slice(-40));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setMessages((m) => [...m, scopedReply(clean, sellerId)].slice(-40));
    }, 750);
  };

  return (
    <div className="hw" aria-label={`${host} — ${seller.name}'s AI host`}>
      <header className="hw-top">
        <span className="hw-orb" aria-hidden="true">
          <HelmetMark size={20} fill="#ffffff" />
        </span>
        <span className="grow">
          <b>{host}</b>
          <span className="hw-powered">Powered by Scopie · AI host, always disclosed</span>
        </span>
        <span className="rehearsal-chip">Rehearsal</span>
      </header>

      <div className="hw-log" ref={logRef} role="log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`hw-msg hw-msg--${m.from}`}>
            <span className="hw-bubble">{m.text}</span>
            {m.product && (
              <a
                className="hw-product"
                href={`/?panel=ask&q=${encodeURIComponent(m.product.title)}`}
                target="_blank"
                rel="noreferrer"
              >
                {m.product.imageUrl && <img src={m.product.imageUrl} alt="" />}
                <span className="grow">
                  <b>{m.product.title}</b>
                  <em>{m.product.enquiryOnly ? "Price on request" : formatRM(m.product.priceSen)}</em>
                </span>
                <span className="hw-product-go">Scopie</span>
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="hw-chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="hw-chip" onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="hw-inputrow">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") send(draft);
          }}
          placeholder={`Ask ${host}…`}
          aria-label={`Ask ${host}`}
        />
        <button className="hw-send" onClick={() => send(draft)} aria-label="Send">
          Send
        </button>
      </div>
    </div>
  );
}
