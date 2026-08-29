"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PATHS } from "@/components/Glyph";

// One icon map for the whole app (Glyph.tsx) — a forked copy here is how
// the empty-searchbar-icon bug happened.
const TABS = [
  { href: "/feed", label: "Home", icon: "home" },
  { href: "/discover", label: "Discover", icon: "discover" },
  { href: "/create", label: "Create", icon: "", isCreate: true },
  { href: "/live", label: "Live", icon: "tv" },
  { href: "/shop", label: "Shop", icon: "bag" },
  { href: "/profile", label: "Profile", icon: "user" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The hub ("/") is the gateway between the three experiences — it has no
  // dock; navigation there IS the page.
  if (pathname === "/") return <>{children}</>;
  return (
    <>
      {children}
      <nav className="bottomnav" aria-label="Main">
        <div className="bottomnav-in">
          {TABS.map((tab) => {
            const active = pathname?.startsWith(tab.href);
            if (tab.isCreate) {
              return (
                <Link key={tab.href} href={tab.href} className="navitem nav-create" aria-label="Create">
                  <span className="nav-create-btn" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M12 5.5v13M5.5 12h13" />
                    </svg>
                  </span>
                </Link>
              );
            }
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`navitem${active ? " active" : ""}`}
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {PATHS[tab.icon]}
                </svg>
                <span className="nav-label">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
