"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Award,
  Calendar,
  Check,
  Circle,
  Clock,
  Hourglass,
  Image as ImageIcon,
  Lock,
  Mail,
  User,
  X,
} from "lucide-react";
import {
  fetchInductionForManager,
  setInductionDurationDays,
  type FetchInductionForManagerResult,
} from "@/app/induction/actions";
import type { InductionStepView, InductionView } from "@/app/induction/queries";

// Mirrors templates.ts defaultDurationDays — duplicated to avoid pulling a
// server-only module into this client component.
const DEFAULT_DURATION_DAYS_BY_TEMPLATE: Record<string, number> = {
  Standard: 3,
  ProtegeInternBranch: 3,
  CoachPartTimer: 21,
  FullTimer: 3,
  "IT-Heavy": 7,
  Remote: 7,
};
function effectiveDuration(data: InductionView): number {
  return (
    data.targetDurationDays ??
    DEFAULT_DURATION_DAYS_BY_TEMPLATE[data.workflowTemplate] ??
    3
  );
}

type PhaseId = "pre" | "day1" | "day2" | "day3";

const PHASE_META: { id: PhaseId; label: string; accent: string; text: string }[] = [
  { id: "pre", label: "Pre-Onboarding", accent: "from-sky-500 to-blue-600", text: "text-sky-700" },
  { id: "day1", label: "Day 1", accent: "from-violet-500 to-indigo-600", text: "text-violet-700" },
  { id: "day2", label: "Day 2", accent: "from-amber-500 to-orange-600", text: "text-amber-700" },
  { id: "day3", label: "Day 3", accent: "from-emerald-500 to-teal-600", text: "text-emerald-700" },
];

function dayDiff(dueIso: string, startIso: string): number {
  if (!dueIso || !startIso) return 0;
  const due = new Date(dueIso).getTime();
  const start = new Date(startIso).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(start)) return 0;
  return Math.round((due - start) / 86_400_000);
}

function bucketFor(daysFromStart: number): PhaseId {
  if (daysFromStart < 0) return "pre";
  if (daysFromStart === 0) return "day1";
  if (daysFromStart === 1) return "day2";
  return "day3";
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface Props {
  userId: number;
  fallbackName?: string | null;
  onClose: () => void;
}

export default function EmployeeDetailModal({ userId, fallbackName, onClose }: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "loaded"; data: InductionView }
    | { kind: "error"; error: string }
  >({ kind: "loading" });
  const [lightboxStepId, setLightboxStepId] = useState<number | null>(null);

  // Reset to the loading state when the target user changes — done during
  // render (React's "adjust state on prop change" pattern) rather than a
  // synchronous setState inside the effect below.
  const [trackedUserId, setTrackedUserId] = useState(userId);
  if (trackedUserId !== userId) {
    setTrackedUserId(userId);
    setState({ kind: "loading" });
  }

  useEffect(() => {
    let cancelled = false;
    fetchInductionForManager(userId).then((res: FetchInductionForManagerResult) => {
      if (cancelled) return;
      if (res.ok) setState({ kind: "loaded", data: res.data });
      else setState({ kind: "error", error: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader
          state={state}
          fallbackName={fallbackName}
          onClose={onClose}
        />
        <div className="flex-1 overflow-y-auto">
          {state.kind === "loading" && <LoadingState />}
          {state.kind === "error" && <ErrorState message={state.error} fallbackName={fallbackName} />}
          {state.kind === "loaded" && (
            <LoadedBody
              data={state.data}
              onOpenEvidence={(id) => setLightboxStepId(id)}
            />
          )}
        </div>
        <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>

      {lightboxStepId !== null && state.kind === "loaded" && (
        <EvidenceLightbox
          step={state.data.steps.find((s) => s.id === lightboxStepId) ?? null}
          onClose={() => setLightboxStepId(null)}
        />
      )}
    </div>
  );
}

function ModalHeader({
  state,
  fallbackName,
  onClose,
}: {
  state:
    | { kind: "loading" }
    | { kind: "loaded"; data: InductionView }
    | { kind: "error"; error: string };
  fallbackName?: string | null;
  onClose: () => void;
}) {
  const name =
    state.kind === "loaded"
      ? state.data.employeeName
      : fallbackName || "Employee";
  const subtitle =
    state.kind === "loaded"
      ? state.data.employeeEmail
      : state.kind === "loading"
        ? "Loading induction…"
        : "";

  return (
    <div className="bg-gradient-to-r from-slate-900 to-slate-700 px-6 py-5 text-white">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/70">
            <User className="h-3.5 w-3.5" />
            Employee induction
          </div>
          <h2 className="mt-1 truncate text-xl font-bold">{name}</h2>
          {subtitle && (
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-white/70">
              <Mail className="h-3 w-3" />
              {subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-white/80 transition hover:bg-white/20 hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-sm text-slate-500 dark:text-slate-400">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-slate-700 dark:border-t-slate-300" />
      Loading induction details…
    </div>
  );
}

function ErrorState({ message, fallbackName }: { message: string; fallbackName?: string | null }) {
  return (
    <div className="px-6 py-10">
      <div className="flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-900 p-4 text-sm text-red-800 dark:text-red-200 ring-1 ring-red-200 dark:ring-red-700/40">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">Couldn&rsquo;t load induction for {fallbackName ?? "this employee"}</p>
          <p className="mt-1 text-red-700 dark:text-red-300">{message}</p>
        </div>
      </div>
    </div>
  );
}

function LoadedBody({
  data,
  onOpenEvidence,
}: {
  data: InductionView;
  onOpenEvidence: (stepId: number) => void;
}) {
  const total = data.steps.length;
  const done = data.steps.filter((s) => s.status === "Completed").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const stepsByPhase = useMemo(() => {
    const map: Record<PhaseId, InductionStepView[]> = {
      pre: [],
      day1: [],
      day2: [],
      day3: [],
    };
    for (const s of [...data.steps].sort((a, b) => a.stepNumber - b.stepNumber)) {
      map[bucketFor(dayDiff(s.dueDate, data.startDate))].push(s);
    }
    return map;
  }, [data.steps, data.startDate]);

  // Phase lock: same logic as OnboardingWorkflow — a phase is locked if any
  // earlier non-empty phase has unfinished steps.
  const lockedPhases = useMemo<Set<PhaseId>>(() => {
    const locked = new Set<PhaseId>();
    let priorIncomplete = false;
    for (const p of PHASE_META) {
      if (priorIncomplete) locked.add(p.id);
      const phaseSteps = stepsByPhase[p.id];
      const allDone =
        phaseSteps.length > 0 &&
        phaseSteps.every((s) => s.status === "Completed");
      if (phaseSteps.length > 0 && !allDone) priorIncomplete = true;
    }
    return locked;
  }, [stepsByPhase]);

  return (
    <div className="space-y-5 px-6 py-5">
      {/* Profile summary */}
      <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 dark:bg-slate-800 p-4 ring-1 ring-slate-100 dark:ring-slate-700">
        <ProfileField
          icon={Calendar}
          label={data.inductionType === "Offboarding" ? "Last day" : "Start date"}
          value={shortDate(data.exitDate ?? data.startDate)}
        />
        <ProfileField
          icon={User}
          label="Department"
          value={data.departmentName ?? "—"}
        />
        <ProfileField
          icon={Award}
          label="Workflow"
          value={`${data.workflowTemplate} · ${data.inductionType}`}
        />
        <ProfileField
          icon={User}
          label="Buddy"
          value={data.buddyName ?? "—"}
        />
        <DurationField data={data} />
      </div>

      {/* Overall progress */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Overall progress</span>
          <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
            {done} of {total} done · <span className="font-bold text-slate-900 dark:text-slate-100">{pct}%</span>
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Per-phase breakdown */}
      <div className="space-y-4">
        {PHASE_META.map((phase) => {
          const phaseSteps = stepsByPhase[phase.id];
          if (phaseSteps.length === 0) return null;
          const phaseDone = phaseSteps.filter((s) => s.status === "Completed").length;
          const phasePct = Math.round((phaseDone / phaseSteps.length) * 100);
          const isLocked = lockedPhases.has(phase.id);
          return (
            <section key={phase.id} className="overflow-hidden rounded-xl ring-1 ring-slate-200 dark:ring-slate-700">
              <header
                className={`flex items-center justify-between bg-gradient-to-r ${phase.accent} px-4 py-2 text-white`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tracking-wide">{phase.label}</span>
                  {isLocked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
                      <Lock className="h-3 w-3" />
                      Locked
                    </span>
                  )}
                </div>
                <span className="text-xs tabular-nums text-white/90">
                  {phaseDone}/{phaseSteps.length} · {phasePct}%
                </span>
              </header>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {phaseSteps.map((step) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    isLocked={isLocked && step.status !== "Completed"}
                    onOpenEvidence={() => onOpenEvidence(step.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ProfileField({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <Icon className="h-3 w-3" />
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{value}</dd>
    </div>
  );
}

function DurationField({ data }: { data: InductionView }) {
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState<string>(String(effectiveDuration(data)));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [override, setOverride] = useState<number | null>(data.targetDurationDays);

  const displayed = override ?? effectiveDuration(data);
  const isOverride = override !== null;

  function save() {
    setError(null);
    const n = parseInt(days, 10);
    if (!Number.isFinite(n) || n <= 0 || n > 365) {
      setError("Enter 1 – 365 days");
      return;
    }
    setPending(true);
    startTransition(async () => {
      const res = await setInductionDurationDays(data.id, n);
      setPending(false);
      if (!res.ok) {
        setError(res.error ?? "Failed");
        return;
      }
      setOverride(n);
      setEditing(false);
    });
  }

  function reset() {
    setError(null);
    setPending(true);
    startTransition(async () => {
      const res = await setInductionDurationDays(data.id, null);
      setPending(false);
      if (!res.ok) {
        setError(res.error ?? "Failed");
        return;
      }
      setOverride(null);
      setDays(
        String(
          DEFAULT_DURATION_DAYS_BY_TEMPLATE[data.workflowTemplate] ?? 3,
        ),
      );
      setEditing(false);
    });
  }

  return (
    <div className="col-span-2">
      <dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <Hourglass className="h-3 w-3" />
        Induction duration
      </dt>
      {editing ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-20 rounded-md border border-slate-300 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400">days</span>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-slate-900 dark:bg-slate-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-60"
            title="Clear override — fall back to template default"
          >
            Use default
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDays(String(displayed));
              setError(null);
            }}
            disabled={pending}
            className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
          >
            Cancel
          </button>
          {error && (
            <p className="basis-full text-[10px] text-red-700 dark:text-red-300">{error}</p>
          )}
        </div>
      ) : (
        <dd className="mt-1 flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {displayed} {displayed === 1 ? "day" : "days"}
          </span>
          {isOverride ? (
            <span className="rounded-full bg-amber-50 dark:bg-amber-900 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-200 ring-1 ring-amber-200 dark:ring-amber-700/40">
              HR-set
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium text-slate-500 dark:text-slate-400">
              default
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setDays(String(displayed));
            }}
            className="text-xs text-slate-500 dark:text-slate-400 underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200 hover:underline"
          >
            Edit
          </button>
        </dd>
      )}
    </div>
  );
}

function StepRow({
  step,
  isLocked,
  onOpenEvidence,
}: {
  step: InductionStepView;
  isLocked: boolean;
  onOpenEvidence: () => void;
}) {
  const status = step.status;
  const StatusIcon =
    status === "Completed" ? Check : status === "In Progress" ? Clock : isLocked ? Lock : Circle;
  const statusColor =
    status === "Completed"
      ? "text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900 ring-emerald-200 dark:ring-emerald-700/40"
      : status === "In Progress"
        ? "text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-900 ring-amber-200 dark:ring-amber-700/40"
        : isLocked
          ? "text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 ring-slate-200 dark:ring-slate-600"
          : "text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 ring-slate-200 dark:ring-slate-700";
  const statusLabel =
    status === "Completed" ? "Completed" : status === "In Progress" ? "In progress" : isLocked ? "Locked" : "Pending";
  const reqLabel = `REQ-${String(step.stepNumber).padStart(3, "0")}`;
  const hasEvidence = Boolean(step.evidenceFileId);

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${statusColor}`}
      >
        <StatusIcon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">{reqLabel}</span>
          <span
            className={`text-sm font-semibold ${status === "Completed" ? "text-slate-500 dark:text-slate-400 line-through" : "text-slate-900 dark:text-slate-100"}`}
          >
            {step.stepNumber}. {step.title}
          </span>
        </div>
        {step.description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{step.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${statusColor}`}
          >
            {statusLabel}
          </span>
          {step.completedAt && (
            <span>Completed {shortDateTime(step.completedAt)}</span>
          )}
          {step.responsibleName && <span>👤 {step.responsibleName}</span>}
        </div>
      </div>
      {hasEvidence && (
        <button
          type="button"
          onClick={onOpenEvidence}
          className="shrink-0 self-center"
          title="View evidence photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/induction-evidence/${step.id}`}
            alt={`Evidence for ${step.title}`}
            className="h-12 w-12 rounded-md object-cover ring-1 ring-slate-200 dark:ring-slate-700 transition hover:ring-2 hover:ring-emerald-400"
            loading="lazy"
          />
        </button>
      )}
      {!hasEvidence && status === "Completed" && (
        <span
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 ring-1 ring-slate-200 dark:ring-slate-700"
          title="No evidence on file"
        >
          <ImageIcon className="h-5 w-5" />
        </span>
      )}
    </li>
  );
}

function EvidenceLightbox({
  step,
  onClose,
}: {
  step: InductionStepView | null;
  onClose: () => void;
}) {
  if (!step || !step.evidenceFileId) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-6"
      onClick={onClose}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-2">
          <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-300">
            Evidence — {step.title}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center bg-slate-50 dark:bg-slate-800 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/induction-evidence/${step.id}`}
            alt={`Evidence for ${step.title}`}
            className="max-h-[75vh] max-w-full object-contain"
          />
        </div>
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
          {step.completedAt && (
            <>Submitted {shortDateTime(step.evidenceUploadedAt ?? step.completedAt)}</>
          )}
        </div>
      </div>
    </div>
  );
}
