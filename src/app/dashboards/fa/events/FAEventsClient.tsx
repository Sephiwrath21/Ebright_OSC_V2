"use client";

import { useState, useRef, useEffect, ReactNode, CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  MapPin,
  CalendarDays,
  Plus,
  Key,
  ChevronRight,
  Home,
} from "lucide-react";

type EventStatus = "draft" | "open" | "ongoing" | "closed" | "completed";

interface FAEvent {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  days: number;
  venue: string;
  status: EventStatus;
  sessions: number;
  invited: number;
  confirmed: number;
  attended?: number;
  month: string;
  day: number;
  year: number;
  archiveDate?: string;
  multiGrade?: boolean;
  invitationOpen?: string;
  invitationClose?: string;
}

const mockActiveEvents: FAEvent[] = [
  {
    id: "1",
    name: "20-21 June Weekly Showcase",
    startDate: "20 Jun 2026",
    endDate: "21 Jun 2026",
    days: 2,
    venue: "KL Gateway",
    status: "closed",
    sessions: 14,
    invited: 268,
    confirmed: 240,
    month: "JUN",
    day: 20,
    year: 2026,
    multiGrade: true,
    invitationOpen: "Jun 1, 2026",
    invitationClose: "Jun 14, 2026",
  },
  {
    id: "2",
    name: "18-19 July Weekly Showcase",
    startDate: "18 Jul 2026",
    endDate: "19 Jul 2026",
    days: 2,
    venue: "Pavilion Damansara Heights",
    status: "ongoing",
    sessions: 14,
    invited: 215,
    confirmed: 180,
    month: "JUL",
    day: 18,
    year: 2026,
    multiGrade: true,
    invitationOpen: "Jun 15, 2026",
    invitationClose: "Jul 4, 2026",
  },
  {
    id: "3",
    name: "25-26 July Weekly Showcase",
    startDate: "25 Jul 2026",
    endDate: "26 Jul 2026",
    days: 2,
    venue: "NU Empire",
    status: "draft",
    sessions: 14,
    invited: 0,
    confirmed: 0,
    month: "JUL",
    day: 25,
    year: 2026,
  },
];

const mockArchiveEvents: FAEvent[] = [
  {
    id: "a1",
    name: "16-17 May Weekly Showcase",
    startDate: "16 May 2026",
    endDate: "17 May 2026",
    days: 2,
    venue: "Mid Valley",
    status: "completed",
    sessions: 14,
    invited: 249,
    confirmed: 191,
    attended: 190,
    month: "MAY",
    day: 16,
    year: 2026,
    archiveDate: "Jun 10, 2026",
  },
  {
    id: "a2",
    name: "30-31 May Weekly Showcase",
    startDate: "30 May 2026",
    endDate: "31 May 2026",
    days: 2,
    venue: "Sunway Pyramid",
    status: "completed",
    sessions: 14,
    invited: 190,
    confirmed: 146,
    attended: 146,
    month: "MAY",
    day: 30,
    year: 2026,
    archiveDate: "Jun 4, 2026",
  },
  {
    id: "a3",
    name: "FA MAY",
    startDate: "16 May 2026",
    endDate: "16 May 2026",
    days: 1,
    venue: "HQ",
    status: "completed",
    sessions: 10,
    invited: 0,
    confirmed: 0,
    attended: 0,
    month: "MAY",
    day: 16,
    year: 2026,
    archiveDate: "May 16, 2026",
  },
  {
    id: "a4",
    name: "test",
    startDate: "8 May 2026",
    endDate: "8 May 2026",
    days: 1,
    venue: "HQ",
    status: "completed",
    sessions: 10,
    invited: 2,
    confirmed: 0,
    attended: 0,
    month: "MAY",
    day: 8,
    year: 2026,
    archiveDate: "May 8, 2026",
  },
  {
    id: "a5",
    name: "Historical FA (pre-portal records)",
    startDate: "1 Jan 2025",
    endDate: "1 Jan 2025",
    days: 1,
    venue: "—",
    status: "completed",
    sessions: 1,
    invited: 710,
    confirmed: 710,
    attended: 710,
    month: "JAN",
    day: 1,
    year: 2025,
    archiveDate: "Jan 1, 2025",
  },
];

const STATUS_FILTERS: { label: string; value: EventStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Open", value: "open" },
  { label: "Ongoing", value: "ongoing" },
  { label: "Closed", value: "closed" },
  { label: "Completed", value: "completed" },
];

const STATUS_STYLES: Record<EventStatus, { dot: string; text: string; bg: string }> = {
  draft:     { dot: "bg-slate-400",  text: "text-slate-600",  bg: "bg-slate-100"  },
  open:      { dot: "bg-blue-500",   text: "text-blue-700",   bg: "bg-blue-50"    },
  ongoing:   { dot: "bg-teal-500",   text: "text-teal-700",   bg: "bg-teal-50"    },
  closed:    { dot: "bg-amber-500",  text: "text-amber-700",  bg: "bg-amber-50"   },
  completed: { dot: "bg-green-500",  text: "text-green-700",  bg: "bg-green-50"   },
};

function StatusBadge({ status }: { status: EventStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

type HoverPlacement = "right" | "left" | "above" | "below";

function HoverPreview({ children, preview, width = 320 }: {
  children: ReactNode;
  preview: ReactNode;
  width?: number;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: HoverPlacement } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function open() {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(hover: none)").matches) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let placement: HoverPlacement;
    if (vw < 768) {
      placement = vh - rect.bottom >= 260 ? "below" : "above";
    } else if (vw - rect.right >= width + gap) {
      placement = "right";
    } else if (rect.left >= width + gap) {
      placement = "left";
    } else if (vh - rect.bottom >= 260) {
      placement = "below";
    } else {
      placement = "above";
    }

    let top: number, left: number;
    if (placement === "right")       { top = rect.top + rect.height / 2; left = rect.right + gap; }
    else if (placement === "left")   { top = rect.top + rect.height / 2; left = rect.left - gap; }
    else if (placement === "below")  { top = rect.bottom + gap; left = rect.left + rect.width / 2; }
    else                             { top = rect.top - gap;    left = rect.left + rect.width / 2; }

    if (placement === "above" || placement === "below") {
      left = Math.min(Math.max(left, width / 2 + 16), vw - width / 2 - 16);
    }

    setCoords({ top, left, placement });
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setMounted(true);
    requestAnimationFrame(() => setVisible(true));
  }

  function close() {
    setVisible(false);
    closeTimer.current = setTimeout(() => setMounted(false), 160);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!mounted) return;
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [mounted]);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const baseTranslate = !coords ? "" :
    coords.placement === "right" ? "translateY(-50%)" :
    coords.placement === "left"  ? "translate(-100%, -50%)" :
    coords.placement === "above" ? "translate(-50%, -100%)" :
                                   "translate(-50%, 0)";

  const transformOrigin = !coords ? "center" :
    coords.placement === "right" ? "left center" :
    coords.placement === "left"  ? "right center" :
    coords.placement === "above" ? "center bottom" :
                                   "center top";

  const arrowStyle: CSSProperties | null = !coords ? null :
    coords.placement === "right" ? { left: 0, top: "50%", transform: "translate(-50%,-50%) rotate(45deg)", borderLeft: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" } :
    coords.placement === "left"  ? { right: 0, top: "50%", transform: "translate(50%,-50%) rotate(45deg)", borderTop: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0" } :
    coords.placement === "above" ? { left: "50%", bottom: 0, transform: "translate(-50%,50%) rotate(45deg)", borderRight: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" } :
                                   { left: "50%", top: 0, transform: "translate(-50%,-50%) rotate(45deg)", borderTop: "1px solid #e2e8f0", borderLeft: "1px solid #e2e8f0" };

  return (
    <>
      <div ref={wrapRef} onMouseEnter={open} onMouseLeave={close}>
        {children}
      </div>
      {mounted && coords && typeof document !== "undefined" && createPortal(
        <div
          className="fixed pointer-events-none"
          style={{
            zIndex: 9999,
            top: coords.top,
            left: coords.left,
            width,
            transform: `${baseTranslate} scale(${visible ? 1 : 0.96})`,
            transformOrigin,
            opacity: visible ? 1 : 0,
            transition: visible
              ? "opacity 160ms ease-out, transform 160ms cubic-bezier(0.2,0.8,0.2,1)"
              : "opacity 130ms ease-in, transform 130ms ease-in",
          }}
          role="tooltip"
        >
          {arrowStyle && (
            <div className="absolute bg-white" style={{ width: 10, height: 10, ...arrowStyle }} />
          )}
          {preview}
        </div>,
        document.body
      )}
    </>
  );
}

function daysUntil(startDate: string): number {
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const [d, m, y] = startDate.split(" ");
  const target = new Date(Number(y), months[m], Number(d));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function EventPopover({ event }: { event: FAEvent }) {
  const days = daysUntil(event.startDate);
  const countdown =
    days === 0  ? "Today" :
    days === 1  ? "1 day left" :
    days > 1    ? `${days} days left` :
    days === -1 ? "Yesterday" :
                  `${Math.abs(days)} days ago`;

  return (
    <div
      className="bg-white border border-slate-200 rounded-2xl p-5"
      style={{ boxShadow: "0 20px 40px -12px rgba(15,23,42,0.18), 0 4px 12px -4px rgba(15,23,42,0.08)" }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <StatusBadge status={event.status} />
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
          {countdown}
        </span>
      </div>

      <h3 className="text-base font-semibold text-slate-900 mb-3 leading-snug">{event.name}</h3>

      <div className="border-t border-slate-100 mb-3" />

      <div className="space-y-2.5 mb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">When</p>
          <p className="text-sm text-slate-700">
            {event.startDate === event.endDate
              ? event.startDate
              : `${event.startDate} – ${event.endDate}`} · {event.days} {event.days === 1 ? "day" : "days"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Venue</p>
          <p className="text-sm text-slate-700">{event.venue}</p>
        </div>
        {event.invitationOpen && event.invitationClose && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
              Invitation Window
            </p>
            <p className="text-sm text-slate-700 font-mono">
              {event.invitationOpen} → {event.invitationClose}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 pt-3 grid grid-cols-3 divide-x divide-slate-100">
        <div className="text-center pr-3">
          <div className="text-xl font-bold text-slate-800 leading-none">{event.sessions}</div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mt-1">Sessions</div>
        </div>
        <div className="text-center px-3">
          <div className="text-xl font-bold text-slate-800 leading-none">{event.invited}</div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mt-1">Invited</div>
        </div>
        <div className="text-center pl-3">
          <div className={`text-xl font-bold leading-none ${event.confirmed > 0 ? "text-green-600" : "text-slate-800"}`}>
            {event.confirmed}
          </div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mt-1">Confirmed</div>
        </div>
      </div>
    </div>
  );
}

function EventCard({ event, featured = false }: { event: FAEvent; featured?: boolean }) {
  return (
    <HoverPreview preview={<EventPopover event={event} />}>
    <Link
      href={`/dashboards/fa/events/${event.id}`}
      className={`flex gap-5 items-center bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 hover:shadow-sm transition-all ${featured ? "shadow-sm" : ""}`}
    >
      <div className="flex flex-col items-center justify-center min-w-[56px] text-center">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider leading-none">
          {event.month}
        </span>
        <span className={`font-bold leading-none mt-0.5 ${featured ? "text-5xl text-slate-900" : "text-3xl text-slate-800"}`}>
          {event.day}
        </span>
        <span className="text-xs text-slate-400 mt-0.5">{event.year}</span>
      </div>

      <div className="w-px h-full self-stretch bg-slate-200 shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <StatusBadge status={event.status} />
            {event.multiGrade && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                <Key className="w-3 h-3" />
                Multi-grade
              </span>
            )}
          </div>
        </div>
        <h3 className={`font-semibold text-slate-900 mt-2 ${featured ? "text-xl" : "text-base"}`}>
          {event.name}
        </h3>
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
            {event.startDate === event.endDate
              ? event.startDate
              : `${event.startDate} – ${event.endDate}`} · {event.days} {event.days === 1 ? "day" : "days"}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            {event.venue}
          </span>
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-6 shrink-0">
        <Stat label="Sessions" value={event.sessions} />
        <div className="w-px h-8 bg-slate-200" />
        <Stat label="Invited" value={event.invited} />
        <div className="w-px h-8 bg-slate-200" />
        <Stat label="Confirmed" value={event.confirmed} highlight={event.confirmed > 0} />
      </div>
    </Link>
    </HoverPreview>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold leading-none ${highlight ? "text-green-600" : "text-slate-800"}`}>
        {value}
      </div>
      <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

function ArchiveRow({ event }: { event: FAEvent }) {
  return (
    <HoverPreview preview={<EventPopover event={event} />}>
    <Link
      href={`/dashboards/fa/events/${event.id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors group rounded-xl"
    >
      <span className="text-sm text-slate-400 w-28 shrink-0">{event.archiveDate}</span>

      <span className="flex-1 text-sm font-medium text-slate-700 group-hover:text-slate-900 truncate">
        {event.name}
      </span>

      <div className="hidden sm:flex items-center gap-5 shrink-0">
        <StatusBadge status={event.status} />
        <span className="text-sm text-slate-500 w-20 text-right">{event.sessions} sessions</span>
        <span className="text-sm text-slate-500 w-20 text-right">{event.invited} invited</span>
        <span className={`text-sm font-medium w-24 text-right ${event.confirmed > 0 ? "text-green-600" : "text-slate-400"}`}>
          {event.confirmed} confirmed
        </span>
        <span className={`text-sm font-medium w-22 text-right ${(event.attended ?? 0) > 0 ? "text-violet-600" : "text-slate-400"}`}>
          {event.attended ?? 0} attended
        </span>
      </div>
    </Link>
    </HoverPreview>
  );
}

export default function FAEventsClient() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EventStatus | "all">("all");

  const q = search.toLowerCase();

  const matchesSearch = (e: FAEvent) =>
    !search || e.name.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q);

  const filteredActive = mockActiveEvents.filter((e) => {
    if (!matchesSearch(e)) return false;
    if (statusFilter === "completed") return false;
    if (statusFilter === "all") return true;
    return e.status === statusFilter;
  });

  // Archive always shows completed; if filter is set to a non-completed status, hide archive
  const showArchive = statusFilter === "all" || statusFilter === "completed";
  const filteredArchive = showArchive
    ? mockArchiveEvents.filter(matchesSearch)
    : [];

  const multiGradeCount = mockActiveEvents.filter((e) => e.multiGrade).length;
  const [nextEvent, ...upcoming] = filteredActive;

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
          <span className="text-slate-800 font-medium">Events</span>
        </nav>

        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">FA Events</h1>
          <button
            type="button"
            onClick={() => router.push("/dashboards/fa/events/new")}
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New event
          </button>
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

          {multiGradeCount > 0 && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors uppercase tracking-wide shrink-0"
            >
              <Key className="w-3.5 h-3.5" />
              Multi-grade
              <span className="ml-0.5 bg-slate-900 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                {multiGradeCount}
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-6 pb-10">
        {/* Active events list */}
        {statusFilter !== "completed" && (
          <>
            {filteredActive.length === 0 && statusFilter !== "all" ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center text-center">
                <CalendarDays className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-sm font-medium text-slate-500">No events match your filters.</p>
              </div>
            ) : (
              <>
                {nextEvent && (
                  <>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                      Next Event
                    </p>
                    <EventCard event={nextEvent} featured />
                  </>
                )}

                {upcoming.length > 0 && (
                  <>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-8 mb-3">
                      Also Upcoming
                    </p>
                    <div className="space-y-3">
                      {upcoming.map((e) => (
                        <EventCard key={e.id} event={e} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* Archive section */}
        {filteredArchive.length > 0 && (
          <div className={statusFilter !== "completed" ? "mt-12" : ""}>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
              Archive
            </p>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
              {filteredArchive.map((e) => (
                <ArchiveRow key={e.id} event={e} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state when completed filter + no archive results */}
        {statusFilter === "completed" && filteredArchive.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center text-center">
            <CalendarDays className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-500">No completed events match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
