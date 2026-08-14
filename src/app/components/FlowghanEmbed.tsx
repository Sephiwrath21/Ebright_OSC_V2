"use client";

import Link from "next/link";
import { Home } from "lucide-react";

// Flowghan (apps/doomtracker) runs as its own isolated React+Vite+Express process
// on its own Postgres. It's reverse-proxied same-origin under /flowghan-embed
// (next.config.ts rewrites) and rendered here as a standalone full-screen page
// (no portal sidebar/topbar — this route is opened in its own tab, see
// Sidebar.tsx) with just a small bar to get back to the portal.
export default function FlowghanEmbed() {
  return (
    <div className="flex h-full flex-1 min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
      <div className="flex items-center h-12 px-4 border-b border-slate-200 bg-white shrink-0 dark:border-slate-800 dark:bg-slate-900">
        <Link
          href="/home"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-950"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          <span>Back to Home</span>
        </Link>
      </div>

      <iframe
        title="Flowghan — Workflow & Process Tracker"
        src="/flowghan-embed/index.html"
        className="flex-1 w-full border-0"
      />
    </div>
  );
}
