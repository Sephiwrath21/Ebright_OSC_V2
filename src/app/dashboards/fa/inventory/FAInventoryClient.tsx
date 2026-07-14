"use client";

import { useState } from "react";
import { CalendarDays, MapPin, Home, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { MOCK_EVENTS, type EventStatus, type InventoryEvent } from "./_mock";

const STATUS_STYLES: Record<EventStatus, { dot: string; text: string; bg: string }> = {
  draft:     { dot: "bg-slate-400",  text: "text-slate-600",  bg: "bg-slate-100" },
  open:      { dot: "bg-blue-500",   text: "text-blue-700",   bg: "bg-blue-50"   },
  ongoing:   { dot: "bg-teal-500",   text: "text-teal-700",   bg: "bg-teal-50"   },
  closed:    { dot: "bg-amber-500",  text: "text-amber-700",  bg: "bg-amber-50"  },
  completed: { dot: "bg-green-500",  text: "text-green-700",  bg: "bg-green-50"  },
};

const STATUS_FILTERS: { label: string; value: EventStatus | "all" }[] = [
  { label: "All",       value: "all"       },
  { label: "Open",      value: "open"      },
  { label: "Ongoing",   value: "ongoing"   },
  { label: "Closed",    value: "closed"    },
  { label: "Completed", value: "completed" },
];

function StatusBadge({ status }: { status: EventStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function EventCard({ event }: { event: InventoryEvent }) {
  return (
    <Link
      href={`/dashboards/fa/inventory/${event.id}`}
      className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 hover:border-slate-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest leading-none">
          {event.monthYear}
        </span>
        <StatusBadge status={event.status} />
      </div>

      <h3 className="text-base font-semibold text-slate-900 leading-snug">{event.name}</h3>

      <div className="space-y-1.5 text-sm text-slate-500 mt-auto">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 shrink-0" />
          <span>{event.dateLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>{event.venue}</span>
        </div>
      </div>
    </Link>
  );
}

export default function FAInventoryClient() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EventStatus | "all">("all");

  const q = search.toLowerCase();
  const filtered = MOCK_EVENTS.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (q && !e.name.toLowerCase().includes(q) && !e.venue.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-0">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500 mb-4">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          <Link href="/dashboards/fa" className="hover:text-slate-900 transition-colors">FA System</Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          <span className="text-slate-800 font-medium">Inventory</span>
        </nav>

        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">Event Inventory</h1>
        </div>
      </div>

      {/* Sticky search + filters bar */}
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search events or venues..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === f.value
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <span className="text-xs text-slate-400 shrink-0">
            {filtered.length} {filtered.length === 1 ? "event" : "events"}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-6 pb-10">
        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center text-center">
            <CalendarDays className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-500">No events match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
