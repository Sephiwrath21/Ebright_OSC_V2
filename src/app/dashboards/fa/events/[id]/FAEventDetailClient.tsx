"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CalendarDays, MapPin, Plus, Clock,
  Pencil, Trash2, Key, ChevronRight,
} from "lucide-react";
import { useBreadcrumb } from "@/app/components/BreadcrumbContext";

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

const ALL_EVENTS: FAEvent[] = [
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

const STATUS_STYLES: Record<EventStatus, { dot: string; text: string; bg: string }> = {
  draft:     { dot: "bg-slate-400",  text: "text-slate-600",  bg: "bg-slate-100"  },
  open:      { dot: "bg-blue-500",   text: "text-blue-700",   bg: "bg-blue-50"    },
  ongoing:   { dot: "bg-teal-500",   text: "text-teal-700",   bg: "bg-teal-50"    },
  closed:    { dot: "bg-amber-500",  text: "text-amber-700",  bg: "bg-amber-50"   },
  completed: { dot: "bg-green-500",  text: "text-green-700",  bg: "bg-green-50"   },
};

const STATUS_FLOW: Partial<Record<EventStatus, { label: string; next: EventStatus }>> = {
  draft:   { label: "Open for invitations", next: "open" },
  open:    { label: "Mark as ongoing",      next: "ongoing" },
  ongoing: { label: "Close event",          next: "closed" },
  closed:  { label: "Mark as completed",    next: "completed" },
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

function StatCard({ label, value, highlight, sub }: {
  label: string;
  value: number;
  highlight?: boolean;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold leading-none ${highlight ? "text-green-600" : "text-slate-900"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
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

export default function FAEventDetailClient() {
  const { id } = useParams<{ id: string }>();
  const event = ALL_EVENTS.find(e => e.id === id) ?? null;

  useBreadcrumb([
    { label: "Home", href: "/home" },
    { label: "FA System", href: "/dashboards/fa" },
    { label: "Events", href: "/dashboards/fa/events" },
    { label: event?.name ?? "Event" },
  ]);

  const [status, setStatus] = useState<EventStatus>(event?.status ?? "draft");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nextStep = STATUS_FLOW[status];

  if (!event) {
    return (
      <div className="min-h-full bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <CalendarDays className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-slate-700 mb-1">Event not found</h1>
          <p className="text-sm text-slate-500 mb-4">This event doesn&apos;t exist or has been removed.</p>
          <Link
            href="/dashboards/fa/events"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> Back to events
          </Link>
        </div>
      </div>
    );
  }

  const days = daysUntil(event.startDate);
  const countdown =
    days === 0  ? "Today" :
    days === 1  ? "1 day left" :
    days > 1    ? `${days} days left` :
    days === -1 ? "Yesterday" :
                  `${Math.abs(days)} days ago`;

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 pt-4 pb-12">

        {/* Back */}
        <Link
          href="/dashboards/fa/events"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to events
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-6 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <StatusBadge status={status} />
              {event.multiGrade && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                  <Key className="w-3 h-3" /> Multi-grade
                </span>
              )}
              <span className="text-xs text-slate-400 font-medium">{countdown}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
              {event.name}
            </h1>
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-500">
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

          <div className="flex items-center gap-2 shrink-0 mt-1">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 bg-white rounded-xl hover:bg-slate-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center justify-center w-9 h-9 border border-slate-200 bg-white rounded-xl hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <hr className="border-slate-200 mb-6" />

        {/* Status action */}
        {nextStep && (
          <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 mb-6 flex items-center justify-between gap-4">
            <p className="text-sm text-slate-600">
              Ready to advance this event?
            </p>
            <button
              type="button"
              onClick={() => setStatus(nextStep.next)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              {nextStep.label}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Stats */}
        <div className={`grid gap-4 mb-6 ${event.status === "completed" ? "grid-cols-4" : "grid-cols-3"}`}>
          <StatCard label="Sessions" value={event.sessions} />
          <StatCard label="Invited" value={event.invited} />
          <StatCard label="Confirmed" value={event.confirmed} highlight={event.confirmed > 0} />
          {event.status === "completed" && (
            <StatCard label="Attended" value={event.attended ?? 0} highlight={(event.attended ?? 0) > 0} />
          )}
        </div>

        {/* Invitation window */}
        {event.invitationOpen && event.invitationClose && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Invitation Window
            </p>
            <p className="font-mono text-sm text-slate-800">
              {event.invitationOpen} → {event.invitationClose}
            </p>
          </div>
        )}

        {/* Sessions */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Sessions</p>
              <h2 className="text-xl font-semibold text-slate-900">Sessions</h2>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add session
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center text-center">
            <Clock className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600 mb-1">No sessions yet</p>
            <p className="text-sm text-slate-400 max-w-xs">
              Add sessions to set up time slots across {event.days === 1 ? "the event day" : `all ${event.days} days`}.
            </p>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add session
            </button>
          </div>
        </div>

        {/* Invitation list placeholder */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-4">
            Invitations
          </p>
          <div className="bg-white border border-slate-200 rounded-2xl p-10 flex flex-col items-center text-center">
            <p className="text-sm text-slate-400">
              {event.invited > 0
                ? `${event.invited} invitations have been sent for this event.`
                : "No invitations yet. Open the event to allow Branch Managers to invite students."}
            </p>
          </div>
        </div>

      </div>

      {/* Delete confirm overlay */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Delete this event?</h2>
            <p className="text-sm text-slate-500 mb-6">
              This will permanently delete <strong>{event.name}</strong> along with all its sessions,
              quotas, and invitations. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <Link
                href="/dashboards/fa/events"
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
              >
                Delete event
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
