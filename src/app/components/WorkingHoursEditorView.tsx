"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Home,
  ChevronRight,
  Clock,
  Calendar as CalendarIcon,
  Save,
  AlertCircle,
  CheckCircle2,
  History,
} from "lucide-react";

const DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

type DayValue = { start: string; end: string } | null;
type WeeklySchedule = Partial<Record<DayKey, DayValue>>;

export interface StaffOption {
  id: number;
  name: string;
  branch: string | null;
  employeeId: string | null;
  position: string | null;
  /** Current cached workingHours on BranchStaff (the latest snapshot). */
  currentSchedule: Record<string, unknown> | null;
}

export interface ScheduleVersion {
  effectiveFrom: string; // YYYY-MM-DD
  schedule: WeeklySchedule;
}

// Monday-of-this-week (UI default for "Effective from") — local timezone,
// so the calendar week matches what a person would call "this week".
function mondayOfThisWeek(): string {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun..6=Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + delta);
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
}

function emptyWeek(): WeeklySchedule {
  return { Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null, Sun: null };
}

export default function WorkingHoursEditorView({
  staff,
  selectedId,
  versions,
}: {
  staff: StaffOption[];
  selectedId: number | null;
  versions: ScheduleVersion[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  const selected = staff.find((s) => s.id === selectedId) ?? null;

  // Seed the editor with the most-recent version OR the cached current
  // schedule OR an empty week.
  const initialSchedule: WeeklySchedule = useMemo(() => {
    const last = versions[versions.length - 1]?.schedule;
    if (last) return { ...emptyWeek(), ...last };
    const current = selected?.currentSchedule as WeeklySchedule | null;
    if (current) return { ...emptyWeek(), ...current };
    return emptyWeek();
  }, [versions, selected]);

  const [draft, setDraft] = useState<WeeklySchedule>(initialSchedule);
  const [effectiveFrom, setEffectiveFrom] = useState<string>(mondayOfThisWeek());
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) =>
      [s.name, s.employeeId, s.branch, s.position]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [staff, search]);

  const selectStaff = (id: number) => {
    setStatus(null);
    startTransition(() => router.replace(`/attendance/working-hours?staffId=${id}`));
  };

  const toggleDay = (day: DayKey) => {
    setDraft((prev) => ({
      ...prev,
      [day]: prev[day] ? null : { start: "09:00", end: "18:00" },
    }));
  };

  const updateField = (day: DayKey, field: "start" | "end", value: string) => {
    setDraft((prev) => {
      const current = prev[day];
      if (!current) return prev;
      return { ...prev, [day]: { ...current, [field]: value } };
    });
  };

  const onSave = async () => {
    if (!selected) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/staff-schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employmentId: selected.id,
          effectiveFrom,
          schedule: draft,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setStatus({ kind: "ok", msg: `Saved. Hours take effect ${effectiveFrom}.` });
      startTransition(() => router.refresh());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      setStatus({ kind: "err", msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-16 space-y-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-all">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/attendance" className="hover:text-slate-900 transition-all">Attendance</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Working Hours</span>
        </nav>

        <header className="bg-gradient-to-b from-white to-slate-50 border border-slate-200 rounded-2xl shadow-sm p-6 md:p-8">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
              Versioned schedule
            </p>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Working Hours</h1>
          <p className="mt-1.5 text-sm font-medium text-slate-500">
            Each save creates a dated version. Past weeks keep the hours that were active then.
          </p>
        </header>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-[320px_1fr]">
          {/* Staff list */}
          <aside className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col max-h-[70vh]">
            <div className="px-4 py-3 border-b border-slate-200">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, branch, ID…"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {filteredStaff.length} of {staff.length}
              </p>
            </div>
            <ul className="overflow-y-auto divide-y divide-slate-100">
              {filteredStaff.map((s) => {
                const active = s.id === selectedId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => selectStaff(s.id)}
                      disabled={isPending}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        active ? "bg-indigo-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-semibold ${active ? "text-indigo-700" : "text-slate-800"}`}>
                          {s.name}
                        </span>
                        {s.branch && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            {s.branch}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] font-mono text-slate-400">
                        {s.employeeId ?? "—"}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Editor */}
          {selected ? (
            <section className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{selected.name}</h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {selected.position ?? "—"} · {selected.branch ?? "—"} · {selected.employeeId ?? "—"}
                    </p>
                  </div>
                  <label className="inline-flex items-center h-10 rounded-xl border border-slate-200 bg-white px-3 gap-2 text-sm text-slate-700 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
                    <CalendarIcon className="w-4 h-4 text-slate-500" aria-hidden="true" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Effective from</span>
                    <input
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                      className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {DAY_KEYS.map((day) => {
                    const v = draft[day] ?? null;
                    const on = v !== null;
                    return (
                      <div
                        key={day}
                        className={`border rounded-xl p-4 transition-all ${
                          on ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-slate-50/40"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock className={`w-4 h-4 ${on ? "text-indigo-600" : "text-slate-400"}`} aria-hidden="true" />
                            <span className={`text-sm font-semibold ${on ? "text-indigo-800" : "text-slate-700"}`}>
                              {day}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleDay(day)}
                            className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full transition-colors ${
                              on
                                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                            }`}
                          >
                            {on ? "On" : "Off"}
                          </button>
                        </div>
                        {on && v && (
                          <div className="mt-3 flex items-center gap-2">
                            <input
                              type="time"
                              value={v.start}
                              onChange={(e) => updateField(day, "start", e.target.value)}
                              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 font-mono tabular-nums focus:outline-none focus:border-indigo-400"
                            />
                            <span className="text-xs text-slate-400 font-semibold">to</span>
                            <input
                              type="time"
                              value={v.end}
                              onChange={(e) => updateField(day, "end", e.target.value)}
                              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 font-mono tabular-nums focus:outline-none focus:border-indigo-400"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {status && (
                  <div
                    className={`mt-5 flex items-start gap-2 text-sm rounded-xl px-3 py-2.5 font-medium ${
                      status.kind === "ok"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {status.kind === "ok" ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    )}
                    <span>{status.msg}</span>
                  </div>
                )}

                <div className="mt-6 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                  >
                    <Save className="w-4 h-4" aria-hidden="true" />
                    {saving ? "Saving…" : "Save Version"}
                  </button>
                </div>
              </div>

              {/* History */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-200">
                  <History className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-800">Schedule History</h3>
                  <span className="text-xs font-medium text-slate-500">
                    {versions.length} version{versions.length === 1 ? "" : "s"}
                  </span>
                </div>
                {versions.length === 0 ? (
                  <p className="px-6 py-10 text-center text-sm font-medium text-slate-400">
                    No versions yet. Saving will create the first one.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {[...versions].reverse().map((v) => (
                      <li key={v.effectiveFrom} className="px-6 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <CalendarIcon className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                            From {v.effectiveFrom}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {DAY_KEYS.map((day) => {
                            const d = v.schedule[day];
                            if (!d) return null;
                            return (
                              <span
                                key={day}
                                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                              >
                                <span className="text-slate-500">{day}</span>
                                <span className="font-mono tabular-nums">{d.start}–{d.end}</span>
                              </span>
                            );
                          })}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : (
            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-12 text-center text-sm font-medium text-slate-500">
              Select a staff member from the list.
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
