"use client";

import { History } from "lucide-react";

// Sends the user back to the classic OSC portal (portal.ebright.my) — a
// SEPARATE application (repo Ebrigth_OSC), not a theme of this one. So this is
// just a cross-origin link; there is no local state to toggle.
//
// Deliberately NOT gated by role. The forward link (classic → V2) is restricted
// to SUPER_ADMIN while V2 is being evaluated, but the way *back* must always be
// available: anyone who lands here — by the switch, a bookmark, or a shared URL
// — needs an escape hatch, and a hidden one is the same as none.
//
// Plain <a>, not next/link: the target is another origin, so the client router
// can't handle it and there's nothing to prefetch.
//
// NOTE ON SESSION — usually NO re-login is needed.
//
// The two portals genuinely don't share a login: this app is NextAuth v5
// (authjs.* cookies) against the `hrfs` database, classic is NextAuth v4
// (next-auth.* cookies) against `ebright_hrfs`. But sharing isn't what makes
// this work. Classic's session cookie is scoped to its own host and lives 30
// days (it sets no maxAge, so NextAuth's default applies). Browsing here never
// sent that cookie to this origin, but it never deleted it either — so going
// back to classic hands it straight back and the user is already signed in.
//
// They only see a login screen if they genuinely have no live classic session:
// never logged in on this browser, signed out, 30 days elapsed, or the session
// was revoked (classic does that on password change). In that case classic's
// middleware redirects to /login with a callbackUrl, so they still land on
// /home afterwards rather than somewhere arbitrary.
//
// Linking straight to /home rather than the site root: one less redirect hop,
// and it makes that callbackUrl land on the page they actually asked for.

const CLASSIC_BASE = (
  process.env.NEXT_PUBLIC_OSC_CLASSIC_URL || "https://portal.ebright.my"
).replace(/\/+$/, ""); // tolerate a trailing slash in the env value
const CLASSIC_URL = `${CLASSIC_BASE}/home`;

export default function SwitchToClassicUi({ collapsed }: { collapsed: boolean }) {
  return (
    // overflow-hidden so the label clips as the rail narrows, matching how the
    // nav rows above behave (their wrapper is overflow-x-hidden) rather than
    // wrapping or forcing the rail wider.
    <div className="shrink-0 border-t border-slate-200 p-3 overflow-hidden">
      <a
        href={CLASSIC_URL}
        title="Go to the classic portal (portal.ebright.my)"
        aria-label="Switch to Classic UI"
        className={`relative flex items-center gap-3 w-full rounded-lg text-sm font-medium
          transition-colors focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-blue-500 px-3 py-2.5 text-slate-700 hover:bg-slate-100 ${
            collapsed ? "justify-center" : ""
          }`}
      >
        <History className="w-5 h-5 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">Switch to Classic UI</span>
      </a>
    </div>
  );
}
