import Link from "next/link";
import { Hero } from "@/components/Glyph";

/** Branded 404 — stale deep links must land somewhere with a way back. */
export default function NotFound() {
  return (
    <main className="page page--pad" style={{ textAlign: "center", paddingTop: 80 }}>
      <Hero kind="discover" />
      <h1 className="page-title">Nothing here</h1>
      <p className="page-sub">That link doesn&rsquo;t go anywhere — it may be old, or mistyped.</p>
      <Link href="/" className="btn btn-primary" style={{ width: "auto" }}>
        Back to Scopie
      </Link>
    </main>
  );
}
