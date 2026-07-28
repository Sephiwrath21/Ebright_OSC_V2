"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, ShieldCheck, Handshake } from "lucide-react";

const TABS = [
  { label: "Account Management", href: "/account-management", Icon: Users },
  { label: "Access Management", href: "/access-management", Icon: ShieldCheck },
  { label: "Buddy System", href: "/buddy-system", Icon: Handshake },
] as const;

/**
 * Segmented tab strip shared by the Account/Access management pages.
 * Rendered at the right end of each page's header row.
 */
export default function AccessTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Account management sections"
      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
    >
      {TABS.map(({ label, href, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
              active
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
