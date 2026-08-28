/**
 * Scopie's icon language: 1.8px rounded strokes, one set everywhere.
 * StrokeIcon = inline glyph (action rails, buttons). Hero = the large
 * empty/status-screen glyph in a soft tinted circle — replaces the old
 * platform-dependent OS emoji.
 */

export const PATHS: Record<string, React.ReactNode> = {
  home: (
    <>
      <path d="M4.5 11.1 12 4.9l7.5 6.2" />
      <path d="M6.4 10.4v8a1.2 1.2 0 0 0 1.2 1.2h8.8a1.2 1.2 0 0 0 1.2-1.2v-8" />
    </>
  ),
  discover: (
    <>
      <circle cx="11" cy="11" r="6.3" />
      <path d="m15.7 15.7 4 4" />
    </>
  ),
  check: <path d="M5.5 12.5l4.2 4.2L18.5 7.5" />,
  cross: <path d="M7 7l10 10M17 7L7 17" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  bag: (
    <>
      <path d="M6.6 8.4h10.8l.9 10a1.3 1.3 0 0 1-1.3 1.4H7a1.3 1.3 0 0 1-1.3-1.4l.9-10Z" />
      <path d="M9.1 8.4V7.1a2.9 2.9 0 0 1 5.8 0v1.3" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.3" r="3.7" />
      <path d="M5.4 19.5c.8-3.1 3.5-4.8 6.6-4.8s5.8 1.7 6.6 4.8" />
    </>
  ),
  tv: (
    <>
      <rect x="3.6" y="5.6" width="16.8" height="12.8" rx="3.2" />
      <path d="M10.6 9.6v4.8l4.1-2.4z" fill="currentColor" stroke="none" />
    </>
  ),
  camera: (
    <>
      <rect x="3.5" y="6.5" width="12.5" height="11" rx="2.6" />
      <path d="m16 10.6 4.5-2.6v8l-4.5-2.6" />
    </>
  ),
  smile: <path d="M6.5 12.5c2.4 4 8.6 4 11 0" strokeWidth="2.4" />,
  spark: <path d="M12 3.5 13.9 10 20.5 12 13.9 14 12 20.5 10.1 14 3.5 12 10.1 10z" fill="currentColor" stroke="none" />,
  play: <path d="M8.5 5.8v12.4L18.7 12z" fill="currentColor" stroke="none" />,
  cart: (
    <>
      <path d="M3.5 4.8h2.2l2 10.4a1.3 1.3 0 0 0 1.3 1.1h7.8a1.3 1.3 0 0 0 1.3-1l1.5-6.9H6.4" />
      <circle cx="9.7" cy="19.4" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="16.6" cy="19.4" r="1.35" fill="currentColor" stroke="none" />
    </>
  ),
  heart: (
    <path d="M12 19.2C7.4 16 4.6 13.1 4.6 10a3.8 3.8 0 0 1 6.8-2.3l.6.8.6-.8A3.8 3.8 0 0 1 19.4 10c0 3.1-2.8 6-7.4 9.2Z" />
  ),
  comment: (
    <path d="M12 5c-4.4 0-7.5 2.7-7.5 6 0 1.9 1 3.6 2.6 4.7L6.3 19l3.3-1.1c.8.2 1.6.3 2.4.3 4.4 0 7.5-2.7 7.5-6.1C19.5 7.7 16.4 5 12 5Z" />
  ),
  share: (
    <>
      <path d="M14.2 6.2 20 11l-5.8 4.8v-3.5c-4.4.1-7.2 1.6-9.2 4.4.7-5 3.5-8.3 9.2-8.9V6.2Z" />
    </>
  ),
  "sound-on": (
    <>
      <path d="M5.5 9.6v4.8h3.2l4.3 3.6V6L8.7 9.6H5.5Z" />
      <path d="M16.3 9.4a4.2 4.2 0 0 1 0 5.2" />
      <path d="M18.7 7.4a7.2 7.2 0 0 1 0 9.2" />
    </>
  ),
  "sound-off": (
    <>
      <path d="M5.5 9.6v4.8h3.2l4.3 3.6V6L8.7 9.6H5.5Z" />
      <path d="m16.4 9.9 4.2 4.2M20.6 9.9l-4.2 4.2" />
    </>
  ),
};

export function StrokeIcon({ kind, size = 20 }: { kind: keyof typeof PATHS & string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[kind]}
    </svg>
  );
}

const HERO_TINTS: Record<string, { bg: string; fg: string }> = {
  good: { bg: "var(--good-soft)", fg: "var(--good)" },
  bad: { bg: "var(--bad-soft)", fg: "var(--live-ink)" },
  brand: { bg: "var(--accent-soft)", fg: "var(--accent)" },
};

export function Hero({ kind, tone = "brand" }: { kind: string; tone?: "brand" | "good" | "bad" }) {
  const t = HERO_TINTS[tone] ?? HERO_TINTS.brand!;
  return (
    <div
      aria-hidden="true"
      style={{
        width: 76,
        height: 76,
        margin: "0 auto 14px",
        borderRadius: "50%",
        background: t.bg,
        color: t.fg,
        display: "grid",
        placeItems: "center",
      }}
    >
      <StrokeIcon kind={kind} size={36} />
    </div>
  );
}
