"use client";

import { useId } from "react";

/**
 * The Scopie helmet mark — vectorized from the brand sheet. The visor is a
 * true knockout (the background shows through), matching every official
 * variant; pass `visorFill` to fill it instead (e.g. the app-icon tile).
 */
export function HelmetMark({
  size = 30,
  fill = "gradient",
  smile,
  visorFill,
}: {
  size?: number;
  /** Helmet + ears + smile color; "gradient" = brand violet gradient. */
  fill?: string;
  /** Smile override (defaults to `fill`). */
  smile?: string;
  /** Optional visor fill; omitted = knockout (background shows through). */
  visorFill?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradId = `hm-g-${uid}`;
  const maskId = `hm-m-${uid}`;
  const solid = fill === "gradient" ? `url(#${gradId})` : fill;
  const smileColor = smile ?? solid;

  return (
    <svg viewBox="78 138 356 226" width={size} height={(size * 226) / 356} aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#695ACD" />
          <stop offset="1" stopColor="#9485EB" />
        </linearGradient>
        <mask id={maskId}>
          <rect x="78" y="138" width="356" height="226" fill="#000" />
          <rect x="86" y="192" width="44" height="80" rx="22" fill="#fff" />
          <rect x="382" y="192" width="44" height="80" rx="22" fill="#fff" />
          <path
            d="M256 146 C 346 146, 402 172, 402 252 C 402 306, 386 332, 352 344 C 324 353, 288 356, 256 356 C 224 356, 188 353, 160 344 C 126 332, 110 306, 110 252 C 110 172, 166 146, 256 146 Z"
            fill="#fff"
          />
          <rect x="128" y="163" width="256" height="138" rx="64" fill="#000" />
        </mask>
      </defs>
      {visorFill && <rect x="128" y="163" width="256" height="138" rx="64" fill={visorFill} />}
      <rect x="78" y="138" width="356" height="226" fill={solid} mask={`url(#${maskId})`} />
      <path
        d="M198 262 C 226 292, 286 292, 314 262"
        stroke={smileColor}
        strokeWidth="20"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** The wordmark's aperture "o" — a ring with the two diagonal shutter cuts. */
function ApertureO({ color }: { color: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const maskId = `ao-${uid}`;
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ height: "0.545em", width: "0.545em", display: "inline-block", margin: "0 0.02em" }}
      aria-hidden="true"
    >
      <defs>
        <mask id={maskId}>
          <rect width="100" height="100" fill="#fff" />
          <rect x="38" y="-30" width="15" height="70" fill="#000" transform="rotate(38 50 50)" />
          <rect x="47" y="60" width="15" height="70" fill="#000" transform="rotate(38 50 50)" />
        </mask>
      </defs>
      <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth="24" mask={`url(#${maskId})`} />
    </svg>
  );
}

/** "scopie" with the aperture o. Inherits font size/weight from .brand-word. */
export function Wordmark({ color = "currentColor" }: { color?: string }) {
  return (
    <span className="brand-word" style={{ display: "inline-flex", alignItems: "baseline" }}>
      sc
      <ApertureO color={color} />
      pie
    </span>
  );
}

/** Primary lockup for light surfaces: gradient helmet + violet wordmark. */
export function Brand() {
  return (
    <span className="brand" aria-label="Scopie">
      <HelmetMark size={34} />
      <Wordmark color="#695ACD" />
    </span>
  );
}
