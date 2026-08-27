"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/feed", label: "Home", icon: "M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-7.5Z" },
  { href: "/discover", label: "Discover", icon: "M11 4a7 7 0 1 0 4.6 12.3l3.5 3.5 1.4-1.4-3.5-3.5A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" },
  { href: "/create", label: "Create", icon: "", isCreate: true },
  { href: "/live", label: "Live", icon: "M5 6h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm5 3.5v5l4.5-2.5L10 9.5Z" },
  { href: "/shop", label: "To Shop", icon: "M7 8V7a5 5 0 0 1 10 0v1h2.2l.8 11.2a1 1 0 0 1-1 1.1H5a1 1 0 0 1-1-1.1L4.8 8H7Zm2 0h6V7a3 3 0 1 0-6 0v1Z" },
  { href: "/profile", label: "Profile", icon: "M12 4a4.2 4.2 0 1 1 0 8.4A4.2 4.2 0 0 1 12 4Zm0 10c3.9 0 7 2 7 4.6V20H5v-1.4C5 16 8.1 14 12 14Z" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      {children}
      <nav className="bottomnav" aria-label="Main">
        <div className="bottomnav-in bottomnav-6">
          {TABS.map((tab) => {
            const active = pathname?.startsWith(tab.href);
            if (tab.isCreate) {
              return (
                <Link key={tab.href} href={tab.href} className="navitem nav-create" aria-label="Create">
                  <span className="nav-create-btn" aria-hidden="true">
                    +
                  </span>
                </Link>
              );
            }
            return (
              <Link key={tab.href} href={tab.href} className={`navitem${active ? " active" : ""}`}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
