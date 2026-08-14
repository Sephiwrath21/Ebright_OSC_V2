"use client";

import Link from "next/link";
import { Home, ChevronRight } from "lucide-react";

// Flowghan (apps/doomtracker) runs as its own isolated React+Vite+Express process
// on its own Postgres. It's reverse-proxied same-origin under /flowghan-embed
// (next.config.ts rewrites) and rendered here inside the portal's own
// sidebar/breadcrumb chrome via iframe — the same pattern as CepEmbed.
export default function FlowghanEmbed() {
  return (
    <div className="flex h-full min-h-full flex-col bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl w-full mx-auto px-6 pt-4 shrink-0">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-950"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium dark:text-slate-100">Flowghan</span>
        </nav>
      </div>

      <iframe
        title="Flowghan — Workflow & Process Tracker"
        src="/flowghan-embed/index.html"
        className="flex-1 w-full border-0 mt-4"
      />
    </div>
  );
}
