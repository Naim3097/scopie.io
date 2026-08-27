"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Soft stroke icons — the brand's icon language is a 1.8px rounded line. */
const ICONS: Record<string, React.ReactNode> = {
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
  live: (
    <>
      <rect x="3.6" y="5.6" width="16.8" height="12.8" rx="3.2" />
      <path d="M10.6 9.6v4.8l4.1-2.4z" fill="currentColor" stroke="none" />
    </>
  ),
  shop: (
    <>
      <path d="M6.6 8.4h10.8l.9 10a1.3 1.3 0 0 1-1.3 1.4H7a1.3 1.3 0 0 1-1.3-1.4l.9-10Z" />
      <path d="M9.1 8.4V7.1a2.9 2.9 0 0 1 5.8 0v1.3" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8.3" r="3.7" />
      <path d="M5.4 19.5c.8-3.1 3.5-4.8 6.6-4.8s5.8 1.7 6.6 4.8" />
    </>
  ),
};

const TABS = [
  { href: "/feed", label: "Home", icon: "home" },
  { href: "/discover", label: "Discover", icon: "discover" },
  { href: "/create", label: "Create", icon: "", isCreate: true },
  { href: "/live", label: "Live", icon: "live" },
  { href: "/shop", label: "Shop", icon: "shop" },
  { href: "/profile", label: "Profile", icon: "profile" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
                  {ICONS[tab.icon]}
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
