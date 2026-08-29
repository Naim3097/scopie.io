/**
 * Remounts per navigation — one quiet 150ms enter for every route change so
 * page swaps stop being hard cuts. The dock and sheets live OUTSIDE this
 * subtree (AppShell/CommerceProvider render them as siblings), so the
 * transient transform can't disturb their fixed positioning.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-frame">{children}</div>;
}
