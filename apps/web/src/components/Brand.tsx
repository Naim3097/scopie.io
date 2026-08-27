/**
 * Scopie lockup — placeholder mark drawn in SVG until final assets land:
 * the violet visor pill with the smile, plus the gradient lowercase wordmark.
 */
export function Brand() {
  return (
    <span className="brand" aria-label="Scopie">
      <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="scopie-mark-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#695ACD" />
            <stop offset="1" stopColor="#9485EB" />
          </linearGradient>
        </defs>
        <rect x="1.5" y="5" width="29" height="22" rx="11" fill="url(#scopie-mark-g)" />
        <path
          d="M10.5 14.2c2 3.6 9 3.6 11 0"
          stroke="#fff"
          strokeWidth="2.7"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <span className="brand-word">scopie</span>
    </span>
  );
}
