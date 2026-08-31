/**
 * Remounts per navigation — one quiet 150ms enter for every route change so
 * page swaps stop being hard cuts. Sheets live OUTSIDE this subtree
 * (CommerceProvider renders them as a sibling), and the surface's own
 * chrome/panels are position:fixed only after the enter animation completes,
 * so the transient transform can't disturb them.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-frame">{children}</div>;
}
