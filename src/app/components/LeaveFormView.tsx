"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Home as HomeIcon,
  ChevronRight,
  ChevronLeft,
  Check,
  Calendar as CalendarIcon,
  Umbrella,
  Stethoscope,
  AlertTriangle,
  Wallet,
  Tag,
  CircleAlert,
  CheckCircle2,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { submitLeaveRequest } from "@/app/attendance/leave/actions";

export interface LeaveTypeOption {
  id: number;
  code: string;
  name: string;
  // Days remaining. null = unlimited / not tracked.
  balance?: number | null;
}

type Step = 1 | 2 | 3 | 4;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function workingDaysBetween(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0;
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  let count = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (!isWeekend(d)) count++;
  }
  return count;
}

function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// A single ISO date in a human-friendly form, e.g. "Fri, 3 Jul 2026".
function fmtFriendly(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Compact date form for the review / success screens, e.g. "3 Jul 2026".
function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtFriendlyRange(startISO: string, endISO: string | null): string {
  if (!endISO || endISO === startISO) return fmtFriendly(startISO);
  return `${fmtFriendly(startISO)} → ${fmtFriendly(endISO)}`;
}

// ─── Per-type icon & accent ──────────────────────────────────────────────────

interface Accent {
  ring: string;
  border: string;
  tile: string;
  icon: string;
}

// Full literal class strings so Tailwind's scanner picks them up.
const ACCENTS: Record<string, Accent> = {
  blue: {
    ring: "focus-visible:ring-blue-500",
    border: "border-blue-500",
    tile: "bg-blue-50",
    icon: "text-blue-600",
  },
  emerald: {
    ring: "focus-visible:ring-emerald-500",
    border: "border-emerald-500",
    tile: "bg-emerald-50",
    icon: "text-emerald-600",
  },
  amber: {
    ring: "focus-visible:ring-amber-500",
    border: "border-amber-500",
    tile: "bg-amber-50",
    icon: "text-amber-600",
  },
  violet: {
    ring: "focus-visible:ring-violet-500",
    border: "border-violet-500",
    tile: "bg-violet-50",
    icon: "text-violet-600",
  },
  slate: {
    ring: "focus-visible:ring-slate-500",
    border: "border-slate-500",
    tile: "bg-slate-100",
    icon: "text-slate-600",
  },
};

function classify(code: string, name: string): keyof typeof ACCENTS {
  const key = `${code} ${name}`.toLowerCase();
  if (/medical|sick|health|\bml\b/.test(key)) return "emerald";
  if (/emerg|urgent|\bel\b/.test(key)) return "amber";
  if (/unpaid|\bul\b/.test(key)) return "slate";
  if (/annual|vacation|\bal\b|leave/.test(key)) return "blue";
  return "violet";
}

function pickIcon(code: string, name: string): LucideIcon {
  const key = `${code} ${name}`.toLowerCase();
  if (/medical|sick|health|\bml\b/.test(key)) return Stethoscope;
  if (/emerg|urgent|\bel\b/.test(key)) return AlertTriangle;
  if (/unpaid|\bul\b/.test(key)) return Wallet;
  if (/annual|vacation|\bal\b|leave/.test(key)) return Umbrella;
  return Tag;
}

function pickAccent(code: string, name: string): Accent {
  return ACCENTS[classify(code, name)];
}

export default function LeaveFormView({
  leaveTypes,
}: {
  leaveTypes: LeaveTypeOption[];
}) {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [startISO, setStartISO] = useState<string | null>(null);
  const [endISO, setEndISO] = useState<string | null>(null);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [notifyManager, setNotifyManager] = useState(true);
  const [notifyTeam, setNotifyTeam] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  const [submittedDays, setSubmittedDays] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedType = useMemo(
    () => leaveTypes.find((t) => t.id === typeId) ?? null,
    [leaveTypes, typeId],
  );
  const workingDays = workingDaysBetween(
    startISO ?? "",
    endISO ?? startISO ?? "",
  );

  // Step gating
  const canContinue1 = typeId !== null;
  const canContinue2 = startISO !== null;

  function resetForm() {
    setStep(1);
    setTypeId(null);
    setStartISO(null);
    setEndISO(null);
    setHalfDay(false);
    setReason("");
    setNotifyManager(true);
    setNotifyTeam(false);
    setErrorMsg(null);
    setSubmitted(false);
    setSubmittedDays(0);
  }

  function handleSubmit() {
    if (!selectedType || !startISO || isPending) return;
    setErrorMsg(null);

    const fd = new FormData();
    fd.append("leave_type_id", String(selectedType.id));
    fd.append("start_date", startISO);
    fd.append("end_date", endISO ?? startISO);
    fd.append("half_day", halfDay ? "1" : "0");
    fd.append("reason", reason);

    startTransition(async () => {
      const result = await submitLeaveRequest(null, fd);
      if (!result.ok) {
        setErrorMsg(result.error ?? "Failed to submit leave request.");
        return;
      }
      setSubmittedDays(result.totalDays ?? (halfDay ? 0.5 : workingDays));
      setSubmitted(true);
      router.refresh();
    });
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <SuccessScreen
        typeName={selectedType?.name ?? "Leave"}
        days={submittedDays}
        startISO={startISO}
        endISO={endISO}
        onAnother={resetForm}
      />
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-slate-50">
      {/* Breadcrumb — left-aligned to match other pages */}
      <div className="max-w-7xl mx-auto px-6 pt-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <HomeIcon className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/attendance/leave" className="hover:text-slate-900 transition-colors">Leave</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Apply</span>
        </nav>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-12">
        {/* Heading */}
        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">Apply for Leave</h1>
          <p className="mt-1 text-sm text-slate-500">Step {step} of 4</p>
        </header>

        {/* Progress bar */}
        <ProgressBar currentStep={step} />

        {/* Step content */}
        <div className="mt-6 bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6">
          {step === 1 && (
            <Step1 leaveTypes={leaveTypes} typeId={typeId} onSelect={setTypeId} />
          )}
          {step === 2 && (
            <Step2
              startISO={startISO}
              endISO={endISO}
              halfDay={halfDay}
              setHalfDay={setHalfDay}
              onChange={(s, e) => {
                setStartISO(s);
                setEndISO(e);
                if (s && e && s !== e) {
                  setHalfDay(false);
                }
              }}
            />
          )}
          {step === 3 && (
            <Step3
              reason={reason}
              setReason={setReason}
              notifyManager={notifyManager}
              setNotifyManager={setNotifyManager}
              notifyTeam={notifyTeam}
              setNotifyTeam={setNotifyTeam}
            />
          )}
          {step === 4 && (
            <Step4
              type={selectedType}
              startISO={startISO}
              endISO={endISO}
              workingDays={workingDays}
              halfDay={halfDay}
              reason={reason}
              notifyManager={notifyManager}
              notifyTeam={notifyTeam}
            />
          )}
        </div>

        {/* Error */}
        {errorMsg && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
          >
            <CircleAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-red-800">Could not submit request</p>
              <p className="text-xs text-red-700 leading-relaxed">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-6 flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Back
            </button>
          ) : (
            <Link
              href="/attendance/leave"
              className="inline-flex items-center justify-center h-11 px-5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </Link>
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={(step === 1 && !canContinue1) || (step === 2 && !canContinue2)}
              className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              Continue
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Submitting…
                </>
              ) : (
                "Submit application"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Progress bar ────────────────────────────────────────────────────────────

function ProgressBar({ currentStep }: { currentStep: Step }) {
  const steps: { num: Step; label: string }[] = [
    { num: 1, label: "Type" },
    { num: 2, label: "Dates" },
    { num: 3, label: "Reason" },
    { num: 4, label: "Review" },
  ];
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {steps.map((s, i) => {
        const isCompleted = currentStep > s.num;
        const isCurrent = currentStep === s.num;
        return (
          <li key={s.num} className="flex items-center gap-2 sm:gap-3 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  isCompleted
                    ? "bg-blue-600 border-blue-600 text-white"
                    : isCurrent
                      ? "border-blue-600 bg-white text-blue-600"
                      : "border-slate-300 bg-white text-slate-400"
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" aria-hidden="true" /> : s.num}
              </span>
              <span
                className={`text-xs sm:text-sm font-medium truncate ${
                  isCompleted || isCurrent ? "text-slate-900" : "text-slate-400"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 rounded ${currentStep > s.num ? "bg-blue-600" : "bg-slate-200"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Step 1 — Leave type ─────────────────────────────────────────────────────

function Step1({
  leaveTypes,
  typeId,
  onSelect,
}: {
  leaveTypes: LeaveTypeOption[];
  typeId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold text-slate-900">Choose a leave type</h2>
      <p className="text-sm text-slate-500 mb-5">Select the type of leave you&apos;re applying for.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {leaveTypes.length === 0 ? (
          <div className="col-span-full text-center text-sm text-slate-400 py-10">
            No leave types configured.
          </div>
        ) : (
          leaveTypes.map((t) => {
            const Icon = pickIcon(t.code, t.name);
            const accent = pickAccent(t.code, t.name);
            const isSelected = typeId === t.id;
            const balance =
              t.balance == null
                ? "Unlimited"
                : `${t.balance} day${t.balance === 1 ? "" : "s"} left`;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                aria-pressed={isSelected}
                className={`text-left bg-white border-2 rounded-xl p-4 transition-all hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${accent.ring} ${
                  isSelected
                    ? `${accent.border} shadow-sm`
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${accent.tile} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${accent.icon}`} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{t.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{balance}</div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

// ─── Step 2 — Date range with calendar ───────────────────────────────────────

function Step2({
  startISO,
  endISO,
  halfDay,
  setHalfDay,
  onChange,
}: {
  startISO: string | null;
  endISO: string | null;
  halfDay: boolean;
  setHalfDay: (val: boolean) => void;
  onChange: (start: string | null, end: string | null) => void;
}) {
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  }

  function onDayClick(d: Date) {
    if (isWeekend(d)) return;
    const iso = isoDate(d);
    if (!startISO || (startISO && endISO)) {
      // start a new range
      onChange(iso, null);
    } else {
      // extending from start
      if (iso < startISO) {
        onChange(iso, null);
      } else if (iso === startISO) {
        onChange(null, null);
      } else {
        onChange(startISO, iso);
      }
    }
  }

  const showHalfDayToggle = startISO !== null && (endISO === null || endISO === startISO);
  const days = halfDay ? 0.5 : workingDaysBetween(startISO ?? "", endISO ?? startISO ?? "");
  const summary = startISO
    ? `${fmtFriendlyRange(startISO, endISO)} · ${formatDays(days)} working day${
        days === 1 ? "" : "s"
      }`
    : "Pick a start date to begin.";

  return (
    <section>
      <h2 className="text-base font-semibold text-slate-900">Pick your dates</h2>
      <p className="text-sm text-slate-500 mb-4">
        Tap a start date, then tap an end date. Weekends are not selectable.
      </p>

      <div className="max-w-sm mx-auto">
        <Calendar
          viewYear={viewYear}
          viewMonth={viewMonth}
          startISO={startISO}
          endISO={endISO}
          onShiftMonth={shiftMonth}
          onDayClick={onDayClick}
        />
      </div>

      <div className="mt-4 max-w-sm mx-auto bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm">
        <span className={startISO ? "text-slate-900 font-medium" : "text-slate-400"}>
          {summary}
        </span>
      </div>

      {showHalfDayToggle && (
        <div className="mt-3 max-w-sm mx-auto flex items-center gap-2.5 px-1">
          <input
            id="half-day-checkbox"
            type="checkbox"
            checked={halfDay}
            onChange={(e) => setHalfDay(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
          />
          <label htmlFor="half-day-checkbox" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
            Apply as half day leave (0.5 days)
          </label>
        </div>
      )}
    </section>
  );
}

function Calendar({
  viewYear,
  viewMonth,
  startISO,
  endISO,
  onShiftMonth,
  onDayClick,
}: {
  viewYear: number;
  viewMonth: number;
  startISO: string | null;
  endISO: string | null;
  onShiftMonth: (delta: number) => void;
  onDayClick: (d: Date) => void;
}) {
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const firstDay = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const today = isoDate(new Date());

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-2.5">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => onShiftMonth(-1)}
          aria-label="Previous month"
          className="p-1 rounded-md text-slate-600 hover:bg-slate-100"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
          <CalendarIcon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          {monthLabel}
        </div>
        <button
          type="button"
          onClick={() => onShiftMonth(1)}
          aria-label="Next month"
          className="p-1 rounded-md text-slate-600 hover:bg-slate-100"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="py-0.5">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const iso = isoDate(d);
          const weekend = isWeekend(d);
          const isPast = iso < today;
          const isStart = iso === startISO;
          const isEnd = iso === endISO;
          const inRange =
            startISO && endISO && iso > startISO && iso < endISO ? true : false;
          const isToday = iso === today;

          let cls =
            "aspect-square flex items-center justify-center text-xs rounded-md transition-colors select-none";
          if (weekend || isPast) {
            cls += " text-slate-300 cursor-not-allowed bg-slate-50";
          } else if (isStart || isEnd) {
            cls += " bg-blue-600 text-white font-semibold";
          } else if (inRange) {
            cls += " bg-blue-100 text-blue-700";
          } else {
            cls += " text-slate-700 hover:bg-slate-100 cursor-pointer";
            if (isToday) cls += " ring-1 ring-blue-300";
          }

          return (
            <button
              key={i}
              type="button"
              disabled={weekend || isPast}
              onClick={() => onDayClick(d)}
              className={cls}
              aria-label={iso}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 3 — Reason & coverage ──────────────────────────────────────────────

function Step3({
  reason,
  setReason,
  notifyManager,
  setNotifyManager,
  notifyTeam,
  setNotifyTeam,
}: {
  reason: string;
  setReason: (v: string) => void;
  notifyManager: boolean;
  setNotifyManager: (v: boolean) => void;
  notifyTeam: boolean;
  setNotifyTeam: (v: boolean) => void;
}) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Reason</h2>
        <p className="text-sm text-slate-500">Optional — a short note for your manager.</p>
      </div>

      <div>
        <label htmlFor="reason" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
          Reason
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="A short note for your manager…"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="space-y-2 pt-1">
        <ToggleRow
          label="Notify my manager"
          description="Send your manager a heads-up when this is submitted."
          checked={notifyManager}
          onChange={setNotifyManager}
        />
        <ToggleRow
          label="Notify my team"
          description="Let your team know about the date range."
          checked={notifyTeam}
          onChange={setNotifyTeam}
        />
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-3 rounded-xl border border-slate-200">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 ${
          checked ? "bg-blue-600" : "bg-slate-300"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

// ─── Step 4 — Review ─────────────────────────────────────────────────────────

function Step4({
  type,
  startISO,
  endISO,
  workingDays,
  halfDay,
  reason,
  notifyManager,
  notifyTeam,
}: {
  type: LeaveTypeOption | null;
  startISO: string | null;
  endISO: string | null;
  workingDays: number;
  halfDay: boolean;
  reason: string;
  notifyManager: boolean;
  notifyTeam: boolean;
}) {
  const notify =
    notifyManager && notifyTeam
      ? "Manager and team"
      : notifyManager
        ? "Manager"
        : notifyTeam
          ? "Team"
          : "No one";

  const displayDays = halfDay ? 0.5 : workingDays;

  return (
    <section>
      <h2 className="text-base font-semibold text-slate-900">Review your request</h2>
      <p className="text-sm text-slate-500 mb-5">Check the details before submitting.</p>

      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
        <ReviewRow label="Leave type" value={type?.name ?? "—"} />
        <ReviewRow
          label="Dates"
          value={
            startISO
              ? endISO && endISO !== startISO
                ? `${fmt(startISO)} → ${fmt(endISO)}`
                : fmt(startISO)
              : "—"
          }
        />
        <ReviewRow
          label="Working days"
          value={`${formatDays(displayDays)} day${displayDays === 1 ? "" : "s"}`}
        />
        <ReviewRow label="Notify" value={notify} />
        <ReviewRow label="Reason" value={reason.trim() || "—"} />
      </dl>
    </section>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 bg-white">
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 shrink-0 pt-0.5">
        {label}
      </dt>
      <dd className="text-sm text-slate-900 text-right break-words">{value}</dd>
    </div>
  );
}

// ─── Success screen ──────────────────────────────────────────────────────────

function SuccessScreen({
  typeName,
  days,
  startISO,
  endISO,
  onAnother,
}: {
  typeName: string;
  days: number;
  startISO: string | null;
  endISO: string | null;
  onAnother: () => void;
}) {
  return (
    <div className="min-h-full bg-slate-50 flex items-center justify-center px-6 py-20">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-emerald-50 grid place-items-center mx-auto mb-5">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Leave Request Submitted</h2>
        <p className="text-sm text-slate-500 leading-relaxed mb-1">
          Your <span className="font-semibold text-slate-800">{typeName}</span> of{" "}
          <span className="font-semibold text-slate-800">
            {formatDays(days)} {days === 1 ? "day" : "days"}
          </span>{" "}
          from <span className="font-semibold text-slate-800">{fmt(startISO)}</span> to{" "}
          <span className="font-semibold text-slate-800">{fmt(endISO ?? startISO)}</span> has been
          sent for approval.
        </p>
        <p className="text-xs text-slate-400 mb-8">
          You&apos;ll receive a notification once it&apos;s reviewed.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/attendance/leave"
            className="inline-flex items-center h-11 px-5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Back to Leaves
          </Link>
          <button
            type="button"
            onClick={onAnother}
            className="inline-flex items-center h-11 px-6 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Apply Another
          </button>
        </div>
      </div>
    </div>
  );
}
