"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X, CalendarRange, ExternalLink, Building2, Lock } from "lucide-react";

// ─── Types (mirror /api/crm/dashboard/trial-schedule) ─────────────────────────

interface Student {
  appointmentId: string;
  contactId: string;
  opportunityId: string | null;
  name: string;
  phone: string | null;
  branchId: string;
  branchName: string | null;
  region: "A" | "B" | "C" | null;
  source: string | null;
  childAge: string | null;
  startAt: string; // naive KL wall-clock ISO
}
interface SlotCell { slot: string; count: number; students: Student[] }
interface DayBucket { key: string; label: string; slots: SlotCell[] }
interface ScheduleResponse {
  range: { from: string | null; to: string | null };
  branchIds: string[];
  branches: Array<{ id: string; name: string }>;
  days: DayBucket[];
}

type Preset = "today" | "yesterday" | "this_week" | "last_week" | "next_week" | "this_month" | "custom";

const PRESET_OPTIONS: ReadonlyArray<{ key: Preset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "next_week", label: "Next week" },
  { key: "this_month", label: "This month" },
  { key: "custom", label: "Custom" },
];

const DAY_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];
const ALL_SLOTS = ["09:15 AM", "10:30 AM", "12:00 PM", "01:15 PM", "02:45 PM", "04:00 PM", "05:30 PM", "06:00 PM", "07:15 PM", "08:30 PM"];

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function TrialSchedule() {
  const [preset, setPreset] = useState<Preset>("this_week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [branchId, setBranchId] = useState<string>("all");

  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCell, setActiveCell] = useState<{ day: DayBucket; slot: SlotCell } | null>(null);
  const [drill, setDrill] = useState<{ label: string; students: Student[] } | null>(null);
  const [branchTotals, setBranchTotals] = useState<{ label: string; students: Student[] } | null>(null);

  const customApplied = preset === "custom" && !!customFrom && !!customTo;

  const load = useCallback(async () => {
    if (preset === "custom" && !customApplied) return;
    setLoading(true);
    setError(null);
    try {
      const effectivePreset = preset === "custom" && !customApplied ? "this_week" : preset;
      const params = new URLSearchParams({ preset: effectivePreset, branchId });
      if (customApplied) {
        params.set("preset", "custom");
        params.set("from", customFrom);
        params.set("to", customTo);
      }
      const res = await fetch(`/api/crm/dashboard/trial-schedule?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      setData((await res.json()) as ScheduleResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schedule");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset, customApplied, customFrom, customTo, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const branches = data?.branches ?? [];

  // Only show slot rows that have a count somewhere (keeps the grid compact);
  // fall back to the full canonical list when everything's empty.
  const visibleSlots = useMemo(() => {
    if (!data) return ALL_SLOTS;
    const seen = new Set<string>();
    for (const d of data.days) for (const s of d.slots) if (s.count > 0) seen.add(s.slot);
    if (seen.size === 0) return ALL_SLOTS;
    return ALL_SLOTS.filter((s) => seen.has(s));
  }, [data]);

  const { dayTotals, weekTotal } = useMemo(() => {
    const dayTotals: Record<string, number> = {};
    let weekTotal = 0;
    if (data) {
      for (const d of data.days) {
        const sum = d.slots.reduce((acc, s) => acc + s.count, 0);
        dayTotals[d.key] = sum;
        weekTotal += sum;
      }
    }
    return { dayTotals, weekTotal };
  }, [data]);

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <header className="mb-4 space-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Trial Class Schedule</h2>
            <span
              title="Read-only — superadmin view"
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
            >
              <Lock className="h-2.5 w-2.5" /> Read-only
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Students booked into trial classes for the selected range. Click a count for the branch &amp; source breakdown, then drill into who&apos;s joining.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px]">
              <Building2 className="h-3 w-3 text-slate-400" />
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value || "all")}
                className="rounded-md border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 px-1.5 py-0.5 text-[11px] font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>

            <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px]">
              <CalendarRange className="ml-1.5 h-3 w-3 text-slate-400" />
              {PRESET_OPTIONS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPreset(p.key)}
                  className={cn(
                    "rounded-full px-2.5 py-1 font-medium transition",
                    preset === p.key ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {preset === "custom" && (
              <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px]">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-md border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 px-1.5 py-0.5 text-[11px] font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-slate-400">→</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-md border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 px-1.5 py-0.5 text-[11px] font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Trials total — pushed to the far right end of the filter row */}
            <div className="ml-auto inline-flex items-baseline gap-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900 px-3 py-1.5 ring-1 ring-indigo-100 dark:ring-indigo-700">
              <span className="text-2xl font-bold leading-none tabular-nums text-indigo-700 dark:text-indigo-300">
                {loading ? "—" : weekTotal}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">trials total</span>
            </div>
        </div>
      </header>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load schedule: {error}
          <button type="button" onClick={() => void load()} className="ml-3 rounded-md border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : !data ? (
        <p className="py-6 text-center text-sm text-slate-400">No schedule to display.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-separate border-spacing-1.5 text-sm">
            <thead>
              <tr>
                <th className="w-32 text-left text-[10px] font-medium uppercase tracking-wider text-slate-400">Slot</th>
                {DAY_ORDER.map((d) => (
                  <th key={d.key} className="text-center text-[11px] font-semibold text-slate-700">{d.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleSlots.map((slot) => (
                <tr key={slot}>
                  <td className="w-32 text-[11px] font-medium text-slate-500">{slot}</td>
                  {DAY_ORDER.map((d) => {
                    const dayBucket = data.days.find((x) => x.key === d.key);
                    const cell = dayBucket?.slots.find((s) => s.slot === slot);
                    const count = cell?.count ?? 0;
                    const interactive = count > 0;
                    return (
                      <td key={d.key} className="min-w-30">
                        <button
                          type="button"
                          onClick={() => interactive && dayBucket && cell && setActiveCell({ day: dayBucket, slot: cell })}
                          disabled={!interactive}
                          className={cn(
                            "w-full rounded-lg border px-3 py-2 text-center transition",
                            count === 0
                              ? "cursor-default border-slate-200 bg-slate-50 text-slate-400"
                              : "cursor-pointer border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-100",
                          )}
                        >
                          <span className="block text-xl font-bold tabular-nums">{count}</span>
                          {count > 0 && (
                            <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide">View</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="w-32 pt-1 align-bottom text-[10px] font-semibold uppercase tracking-wider text-slate-500">Daily total</td>
                {DAY_ORDER.map((d) => {
                  const total = dayTotals[d.key] ?? 0;
                  const dayBucket = data.days.find((x) => x.key === d.key);
                  const students = dayBucket ? dayBucket.slots.flatMap((s) => s.students) : [];
                  return (
                    <td key={d.key} className="min-w-30 pt-1">
                      <button
                        type="button"
                        disabled={total === 0}
                        onClick={() => total > 0 && setBranchTotals({ label: d.label, students })}
                        title={total > 0 ? "Click for the branch breakdown" : undefined}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-center transition",
                          total === 0
                            ? "cursor-default border-slate-200 bg-slate-100 text-slate-400"
                            : "cursor-pointer border-slate-300 bg-slate-100 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50",
                        )}
                      >
                        <span className="block text-lg font-bold tabular-nums">{total}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {activeCell && (
        <SlotBreakdownModal
          dayLabel={activeCell.day.label}
          slot={activeCell.slot.slot}
          students={activeCell.slot.students}
          onClose={() => { setActiveCell(null); setDrill(null); }}
          onDrill={(label, students) => setDrill({ label, students })}
        />
      )}
      {activeCell && drill && (
        <StudentListModal
          dayLabel={activeCell.day.label}
          slot={activeCell.slot.slot}
          subtitle={drill.label}
          students={drill.students}
          onClose={() => setDrill(null)}
        />
      )}
      {branchTotals && (
        <BranchTotalsModal label={branchTotals.label} students={branchTotals.students} onClose={() => setBranchTotals(null)} />
      )}
    </section>
  );
}

// ─── Branch-totals modal (Daily total drill) ──────────────────────────────────

function BranchTotalsModal({ label, students, onClose }: { label: string; students: Student[]; onClose: () => void }) {
  const rows = useMemo(() => {
    const map = new Map<string, { branch: string; region: "A" | "B" | "C" | null; count: number }>();
    for (const s of students) {
      const branch = s.branchName ?? "Unknown branch";
      let g = map.get(branch);
      if (!g) { g = { branch, region: s.region, count: 0 }; map.set(branch, g); }
      g.count++;
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.branch.localeCompare(b.branch));
  }, [students]);

  return (
    <ModalShell onClose={onClose} maxW="max-w-md" eyebrow="Trial Class · Daily total" title={label}
      subtitle={`${students.length} trial${students.length === 1 ? "" : "s"} across ${rows.length} branch${rows.length === 1 ? "" : "es"}`}>
      <ul className="divide-y divide-slate-100 overflow-y-auto px-2 py-1" style={{ maxHeight: "calc(85vh - 100px)" }}>
        {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">No trials booked.</li>}
        {rows.map((r, i) => (
          <li key={r.branch} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-400">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {r.branch}{r.region ? <span className="font-normal text-slate-400"> · Region {r.region}</span> : null}
              </p>
            </div>
            <span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 px-2 text-sm font-bold tabular-nums text-indigo-700 ring-1 ring-indigo-100">
              {r.count}
            </span>
          </li>
        ))}
      </ul>
    </ModalShell>
  );
}

// ─── Slot breakdown modal (by branch) ─────────────────────────────────────────

function SlotBreakdownModal({ dayLabel, slot, students, onClose, onDrill }: {
  dayLabel: string; slot: string; students: Student[];
  onClose: () => void; onDrill: (label: string, students: Student[]) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { branch: string; region: "A" | "B" | "C" | null; students: Student[] }>();
    for (const s of students) {
      const branch = s.branchName ?? "Unknown branch";
      let g = map.get(branch);
      if (!g) { g = { branch, region: s.region, students: [] }; map.set(branch, g); }
      g.students.push(s);
    }
    return Array.from(map.values()).sort((a, b) => b.students.length - a.students.length || a.branch.localeCompare(b.branch));
  }, [students]);

  return (
    <ModalShell onClose={onClose} maxW="max-w-lg" eyebrow="Trial Class · Breakdown"
      title={`${dayLabel} · ${slot}`}
      subtitle={`${students.length} student${students.length === 1 ? "" : "s"} across ${groups.length} branch${groups.length === 1 ? "" : "es"}`}>
      <div className="overflow-y-auto px-2 py-2" style={{ maxHeight: "calc(85vh - 100px)" }}>
        <button
          type="button"
          onClick={() => onDrill("All branches & sources", students)}
          className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-left transition hover:bg-slate-50"
        >
          <span className="text-sm font-semibold text-slate-700">View all students</span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
            {students.length}<ExternalLink className="h-3 w-3" />
          </span>
        </button>
        <div className="my-1 border-t border-slate-100" />
        <ul className="divide-y divide-slate-100">
          {groups.map((g) => (
            <li key={g.branch}>
              <button
                type="button"
                onClick={() => onDrill(g.region ? `${g.branch} · Region ${g.region}` : g.branch, g.students)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-indigo-50/60"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-bold text-indigo-700 ring-1 ring-indigo-100">
                  {g.students.length}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {g.branch}{g.region ? <span className="font-normal text-slate-400"> · Region {g.region}</span> : null}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {g.students.length} student{g.students.length === 1 ? "" : "s"}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </ModalShell>
  );
}

// ─── Student-list modal ───────────────────────────────────────────────────────

function StudentListModal({ dayLabel, slot, students, subtitle, onClose }: {
  dayLabel: string; slot: string; students: Student[]; subtitle?: string; onClose: () => void;
}) {
  return (
    <ModalShell onClose={onClose} maxW="max-w-lg" eyebrow="Trial Class" title={`${dayLabel} · ${slot}`}
      subtitle={`${students.length} student${students.length === 1 ? "" : "s"} joining`} subheading={subtitle}>
      <ul className="divide-y divide-slate-100 overflow-y-auto px-2" style={{ maxHeight: "calc(85vh - 100px)" }}>
        {students.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">No students booked into this slot.</li>}
        {students.map((s) => {
          // startAt is naive KL wall-clock — render as UTC so the browser's local
          // timezone doesn't add another shift.
          const startAt = new Date(`${s.startAt}Z`);
          return (
            <li key={s.appointmentId} className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-indigo-50 text-sm font-bold text-indigo-700 ring-1 ring-indigo-200">
                {(s.name[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-slate-900">{s.name}</p>
                  {s.childAge && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{s.childAge}</span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {startAt.toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}
                </p>
                {(s.branchName || s.phone || s.source) && (
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500">
                    {s.branchName && (
                      <span className="truncate font-medium text-slate-600">{s.branchName}{s.region ? ` · Region ${s.region}` : ""}</span>
                    )}
                    {s.branchName && s.phone && <span className="text-slate-300">·</span>}
                    {s.phone && <span className="tabular-nums">{s.phone}</span>}
                    {s.source && <span className="text-slate-300">·</span>}
                    {s.source && <span className="truncate">{s.source}</span>}
                  </p>
                )}
              </div>
              <Link
                href={`/crm/contacts/${s.contactId}`}
                onClick={onClose}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-50"
              >
                Open <ExternalLink className="h-3 w-3" />
              </Link>
            </li>
          );
        })}
      </ul>
    </ModalShell>
  );
}

// ─── Shared modal shell ───────────────────────────────────────────────────────

function ModalShell({ onClose, maxW, eyebrow, title, subtitle, subheading, children }: {
  onClose: () => void; maxW: string; eyebrow: string; title: string;
  subtitle?: string; subheading?: string; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative z-10 w-full max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200", maxW)}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600">{eyebrow}</p>
            <h3 className="mt-0.5 text-lg font-bold text-slate-900">{title}</h3>
            {subheading && <p className="mt-0.5 truncate text-[11px] font-medium text-indigo-600">{subheading}</p>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
