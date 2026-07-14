"use client";

import { useState, useMemo, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Home, ChevronRight, CalendarDays, MapPin, Trophy, Mic, Ribbon, Award,
  Check, UserPlus, ArrowLeft,
} from "lucide-react";
import { MOCK_EVENTS, MOCK_INVENTORY, type EventStatus } from "../_mock";

/* ── Status badge ─────────────────────────────────────────────────────────── */

const STATUS_STYLES: Record<EventStatus, { dot: string; text: string; bg: string }> = {
  draft:     { dot: "bg-slate-400",  text: "text-slate-600",  bg: "bg-slate-100" },
  open:      { dot: "bg-blue-500",   text: "text-blue-700",   bg: "bg-blue-50"   },
  ongoing:   { dot: "bg-teal-500",   text: "text-teal-700",   bg: "bg-teal-50"   },
  closed:    { dot: "bg-amber-500",  text: "text-amber-700",  bg: "bg-amber-50"  },
  completed: { dot: "bg-green-500",  text: "text-green-700",  bg: "bg-green-50"  },
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

/* ── Packing checkbox ─────────────────────────────────────────────────────── */

function PackedCheckmark({ packed }: { packed: boolean }) {
  return (
    <span
      className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
        packed ? "border-green-500 bg-green-500" : "border-slate-300 bg-white"
      }`}
      aria-hidden
    >
      {packed && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
    </span>
  );
}

/* ── Packing row ──────────────────────────────────────────────────────────── */

function PackingRow({
  packed, onToggle, label, count,
}: {
  packed: boolean;
  onToggle: () => void;
  label: ReactNode;
  count: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={packed}
      className="w-full flex items-center gap-2.5 text-sm py-1.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
    >
      <PackedCheckmark packed={packed} />
      <span className={`flex-1 ${packed ? "line-through text-slate-400" : "text-slate-700"}`}>
        {label}
      </span>
      <span className={`font-mono font-semibold text-sm ${packed ? "text-slate-400 line-through" : "text-slate-900"}`}>
        {count}
      </span>
    </button>
  );
}

/* ── Inventory section card ───────────────────────────────────────────────── */

function InventorySection({
  icon, iconClass, title, subtitle, total, breakdownTitle, packed, totalItems, empty, children,
}: {
  icon: ReactNode;
  iconClass: string;
  title: string;
  subtitle: string;
  total: number;
  breakdownTitle: string;
  packed: number;
  totalItems: number;
  empty: string;
  children: ReactNode;
}) {
  const allPacked = totalItems > 0 && packed === totalItems;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl ${iconClass} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{subtitle}</p>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        </div>
        <div className="text-5xl font-bold text-slate-900 leading-none tabular-nums">{total}</div>
      </div>

      <div className="border-t border-slate-100 my-4" />

      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{breakdownTitle}</p>
        {totalItems > 0 && (
          <span className={`text-[11px] font-semibold uppercase tracking-widest ${allPacked ? "text-green-600" : "text-slate-400"}`}>
            {allPacked ? "✓ All packed" : `${packed} / ${totalItems} packed`}
          </span>
        )}
      </div>

      {totalItems === 0 ? (
        <p className="text-sm text-slate-400">{empty}</p>
      ) : (
        <div className="space-y-0.5">{children}</div>
      )}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */

export default function FAInventoryDetailClient() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const event = MOCK_EVENTS.find((e) => e.id === id) ?? null;
  const inv   = MOCK_INVENTORY[id] ?? null;

  // Walk-in buffer per grade (1–8)
  const [buffer, setBuffer] = useState<Record<number, number>>({});
  const totalBuffer = useMemo(() => Object.values(buffer).reduce((s, n) => s + n, 0), [buffer]);

  // Merge attendee grade rows with buffer-only grades
  const gradeRows = useMemo(() => {
    const counts = new Map<number, number>();
    inv?.medalsByGrade.forEach(({ grade, count }) => counts.set(grade, count));
    Object.keys(buffer).forEach((g) => {
      const grade = Number(g);
      if (!counts.has(grade)) counts.set(grade, 0);
    });
    return Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([grade, count]) => ({ grade, count }));
  }, [inv, buffer]);

  // Packed state — Set of item keys
  const [packedSet, setPackedSet] = useState<Set<string>>(new Set());
  const isPacked = (key: string) => packedSet.has(key);
  const toggle   = (key: string) =>
    setPackedSet((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  function sectionProgress(keys: string[]) {
    return { packed: keys.filter((k) => isPacked(k)).length, total: keys.length };
  }

  if (!event || !inv) {
    return (
      <div className="min-h-full bg-slate-50 flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <CalendarDays className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">Event not found.</p>
          <Link
            href="/dashboards/fa/inventory"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Inventory
          </Link>
        </div>
      </div>
    );
  }

  const medalKeys   = gradeRows.map(({ grade }) => `medals:G${grade}`);
  const micKeys     = gradeRows.map(({ grade }) => `mics:G${grade}`);
  const sashKeys    = inv.sashesByBranch.map(({ code }) => `sashes:${code}`);
  const certKeys    = inv.certsBySession.map((_, i) => `certs:${i}`);

  const medalsProgress = sectionProgress(medalKeys);
  const micsProgress   = sectionProgress(micKeys);
  const sashesProgress = sectionProgress(sashKeys);
  const certsProgress  = sectionProgress(certKeys);

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
          <Link href="/dashboards/fa/inventory" className="hover:text-slate-900 transition-colors">Inventory</Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          <span className="text-slate-800 font-medium truncate max-w-[200px]">{event.name}</span>
        </nav>

        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">Event Inventory</h1>
        </div>
      </div>

      {/* Sticky bar */}
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <StatusBadge status={event.status} />
          <span className="text-sm font-semibold text-slate-900">{event.name}</span>
          <div className="flex items-center gap-4 ml-auto text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              {event.dateLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {event.venue}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-6 pb-10 space-y-6">

        {/* Walk-in buffer */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Walk-in buffer</p>
              <p className="text-sm text-slate-700 mt-0.5">
                {totalBuffer === 0
                  ? "No buffer — totals reflect confirmed attendees only."
                  : <>Pack <strong className="text-slate-900">{totalBuffer}</strong> extra{totalBuffer === 1 ? "" : "s"} (medals + mics) for unannounced students.</>}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
              <label key={g} className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  G{g}
                </span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={buffer[g] ?? 0}
                  onChange={(e) =>
                    setBuffer((prev) => ({ ...prev, [g]: Number(e.target.value) || 0 }))
                  }
                  className="w-full text-center font-mono px-2 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  aria-label={`Walk-in buffer for grade ${g}`}
                />
              </label>
            ))}
          </div>
        </div>

        {/* Inventory sections — 2-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Medals */}
          <InventorySection
            icon={<Trophy className="w-5 h-5" />}
            iconClass="bg-amber-100 text-amber-700"
            title="Medals"
            subtitle="One per expected attendee"
            total={inv.medalsTotal + totalBuffer}
            breakdownTitle="By grade"
            packed={medalsProgress.packed}
            totalItems={medalsProgress.total}
            empty="No expected attendees yet."
          >
            {gradeRows.map(({ grade, count }) => {
              const key   = `medals:G${grade}`;
              const extra = buffer[grade] ?? 0;
              return (
                <PackingRow
                  key={key}
                  packed={isPacked(key)}
                  onToggle={() => toggle(key)}
                  label={
                    <>
                      Grade {grade}
                      {extra > 0 && (
                        <span className="ml-2 text-xs text-amber-600 font-medium">+{extra} buffer</span>
                      )}
                    </>
                  }
                  count={`× ${count + extra}`}
                />
              );
            })}
          </InventorySection>

          {/* Microphones */}
          <InventorySection
            icon={<Mic className="w-5 h-5" />}
            iconClass="bg-blue-50 text-blue-600"
            title="Microphones"
            subtitle="One per student — takeaway gift"
            total={inv.medalsTotal + totalBuffer}
            breakdownTitle="By grade"
            packed={micsProgress.packed}
            totalItems={micsProgress.total}
            empty="No expected attendees yet."
          >
            {gradeRows.map(({ grade, count }) => {
              const key   = `mics:G${grade}`;
              const extra = buffer[grade] ?? 0;
              return (
                <PackingRow
                  key={key}
                  packed={isPacked(key)}
                  onToggle={() => toggle(key)}
                  label={
                    <>
                      Grade {grade}
                      {extra > 0 && (
                        <span className="ml-2 text-xs text-amber-600 font-medium">+{extra} buffer</span>
                      )}
                    </>
                  }
                  count={`× ${count + extra}`}
                />
              );
            })}
          </InventorySection>

          {/* Sashes */}
          <InventorySection
            icon={<Ribbon className="w-5 h-5" />}
            iconClass="bg-rose-50 text-rose-600"
            title="Sashes"
            subtitle="Reused per session — worst-case per branch"
            total={inv.sashesTotal}
            breakdownTitle="By branch (max session count)"
            packed={sashesProgress.packed}
            totalItems={sashesProgress.total}
            empty="No branches with expected attendees yet."
          >
            {inv.sashesByBranch.map(({ code, name, count }) => {
              const key = `sashes:${code}`;
              return (
                <PackingRow
                  key={key}
                  packed={isPacked(key)}
                  onToggle={() => toggle(key)}
                  label={
                    <>
                      <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded mr-2">
                        {code}
                      </span>
                      {name}
                    </>
                  }
                  count={`× ${count}`}
                />
              );
            })}
          </InventorySection>

          {/* Certificates */}
          <InventorySection
            icon={<Award className="w-5 h-5" />}
            iconClass="bg-green-50 text-green-600"
            title="Certificates"
            subtitle="One per student — personalised by session"
            total={inv.certificatesTotal}
            breakdownTitle="By session"
            packed={certsProgress.packed}
            totalItems={certsProgress.total}
            empty="No sessions yet."
          >
            {inv.certsBySession.map(({ label, count }, i) => {
              const key = `certs:${i}`;
              return (
                <PackingRow
                  key={key}
                  packed={isPacked(key)}
                  onToggle={() => toggle(key)}
                  label={<span className="font-mono text-xs">{label}</span>}
                  count={`× ${count}`}
                />
              );
            })}
          </InventorySection>

        </div>
      </div>
    </div>
  );
}
