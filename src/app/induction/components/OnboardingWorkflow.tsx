"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  Award,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  Clock,
  Gamepad2,
  ImageIcon,
  Laptop,
  Lock,
  Mail,
  Paperclip,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  addSubstepTemplate,
  deleteSubstepTemplate,
  markStepCompleteByToken,
  submitStepEvidenceByToken,
} from "@/app/induction/actions";
import type { InductionStepView } from "@/app/induction/queries";

type Status = "pending" | "in-progress" | "complete";
type PhaseId = "pre" | "day1" | "day2" | "day3";
type StepKind = "process" | "quiz" | "submission";

interface Phase {
  id: PhaseId;
  label: string;
  emoji: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; // tailwind from-X to-Y
  text: string;
  ring: string;
  strokeFrom: string;
  strokeTo: string;
}

const PHASES: Phase[] = [
  {
    id: "pre",
    label: "PRE-ONBOARDING",
    emoji: "📧",
    icon: Mail,
    accent: "from-sky-500 to-blue-600",
    text: "text-sky-700 dark:text-sky-300",
    ring: "ring-sky-200 dark:ring-sky-700",
    strokeFrom: "#0ea5e9",
    strokeTo: "#2563eb",
  },
  {
    id: "day1",
    label: "DAY 1",
    emoji: "📖",
    icon: BookOpen,
    accent: "from-violet-500 to-indigo-600",
    text: "text-violet-700 dark:text-violet-300",
    ring: "ring-violet-200 dark:ring-violet-700",
    strokeFrom: "#8b5cf6",
    strokeTo: "#4f46e5",
  },
  {
    id: "day2",
    label: "DAY 2",
    emoji: "💻",
    icon: Laptop,
    accent: "from-amber-500 to-orange-600",
    text: "text-amber-700 dark:text-amber-300",
    ring: "ring-amber-200 dark:ring-amber-700",
    strokeFrom: "#f59e0b",
    strokeTo: "#ea580c",
  },
  {
    id: "day3",
    label: "DAY 3",
    emoji: "✨",
    icon: Sparkles,
    accent: "from-emerald-500 to-teal-600",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-200 dark:ring-emerald-700",
    strokeFrom: "#10b981",
    strokeTo: "#0d9488",
  },
];

function statusOf(s: InductionStepView["status"]): Status {
  if (s === "Completed") return "complete";
  if (s === "In Progress") return "in-progress";
  return "pending";
}

function statusStyles(status: Status) {
  switch (status) {
    case "complete":
      return {
        ring: "ring-emerald-300 dark:ring-emerald-700",
        bar: "bg-emerald-500",
        chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900 dark:text-emerald-200 dark:ring-emerald-700",
        icon: Check,
        label: "Complete",
      };
    case "in-progress":
      return {
        ring: "ring-amber-300 dark:ring-amber-700",
        bar: "bg-amber-500",
        chip: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:ring-amber-700",
        icon: Clock,
        label: "In progress",
      };
    default:
      return {
        ring: "ring-slate-200 dark:ring-slate-700",
        bar: "bg-slate-300",
        chip: "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
        icon: Circle,
        label: "Pending",
      };
  }
}

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
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function detectKind(step: InductionStepView): StepKind {
  const t = step.title.toLowerCase();
  if (t.includes("quiz") || t.includes("game")) return "quiz";
  if (
    t.includes("submit") ||
    t.includes("record &") ||
    t.includes("photo") ||
    t.includes("attendance check")
  ) {
    return "submission";
  }
  return "process";
}

// Sub-tasks attached to a parent step (e.g. dept-defined Department Training
// sub-tasks). Shape mirrors SubstepTemplateView in queries.ts; declared here
// to avoid importing server-only types into a client component.
export type SubstepEvidence =
  | "photo"
  | "video"
  | "screenshot"
  | "document"
  | "text"
  | "none";

export interface SubstepView {
  id: number;
  title: string;
  description: string | null;
  evidenceType: SubstepEvidence;
  /** Department the sub-task belongs to. NULL = global / legacy. */
  departmentId: number | null;
}

export interface DepartmentOption {
  id: number;
  name: string;
}

// UI metadata per evidence type — icon + label + accent + the human-readable
// instruction shown on the step card.
const EVIDENCE_META: Record<
  SubstepEvidence,
  { label: string; instruction: string; emoji: string; accent: string }
> = {
  photo:      { label: "Photo",      instruction: "Upload a photo as proof",      emoji: "📷", accent: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:ring-amber-700" },
  video:      { label: "Video",      instruction: "Record + upload a short video", emoji: "🎥", accent: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-900 dark:text-rose-200 dark:ring-rose-700" },
  screenshot: { label: "Screenshot", instruction: "Upload a screenshot",          emoji: "🖥️", accent: "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-900 dark:text-sky-200 dark:ring-sky-700" },
  document:   { label: "Document",   instruction: "Upload a PDF or doc",          emoji: "📄", accent: "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-900 dark:text-violet-200 dark:ring-violet-700" },
  text:       { label: "Text",       instruction: "Write a short note / answer",  emoji: "✍️", accent: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700" },
  none:       { label: "Mark done",  instruction: "Just tick when complete",      emoji: "✅", accent: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900 dark:text-emerald-200 dark:ring-emerald-700" },
};

interface Props {
  steps: InductionStepView[];
  startDate: string;
  token?: string;
  canMarkComplete?: boolean;
  title?: string;
  subtitle?: string;
  /**
   * Whether to enforce phase locking (Day 2 locked until Day 1 done, etc).
   * Defaults to true — used on the per-employee induction link. Set to false
   * for the manager-side dashboard preview, where the workflow is shown as a
   * reference template, not an enforceable progression.
   */
  enforceLocking?: boolean;
  /**
   * Substeps keyed by parent step number. Rendered as a small list under the
   * matching parent card. Used for the placeholder steps (Department
   * Training, 3-Week Branch Training) where each dept/branch defines its
   * own sub-tasks.
   */
  substepsByParent?: Record<number, SubstepView[]>;
  /** Template key (e.g. "Standard") — needed by the Add Sub-task form. */
  templateKey?: string;
  /** True only in manager preview — enables the "+ Add" button + delete. */
  canManageSubsteps?: boolean;
  /**
   * Department this sub-workflow is scoped to. For inductees, this is their
   * employment department. For manager preview, this is whichever department
   * the manager has selected in the dashboard dropdown.
   */
  currentDepartmentId?: number | null;
  /** Departments list for the builder modal (manager only). */
  departments?: DepartmentOption[];
}

export default function OnboardingWorkflow({
  steps,
  startDate,
  token,
  canMarkComplete = false,
  title = "Employee Onboarding Flowchart",
  subtitle = "Complete each phase in order — Day 2 unlocks when Day 1 is 100% done.",
  enforceLocking = true,
  substepsByParent = {},
  templateKey,
  canManageSubsteps = false,
  currentDepartmentId = null,
  departments = [],
}: Props) {
  const [openStepId, setOpenStepId] = useState<number | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Map<number, string>>(new Map());
  const [expanded, setExpanded] = useState<Record<PhaseId, boolean>>({
    pre: true,
    day1: true,
    day2: true,
    day3: true,
  });
  const [, startTransition] = useTransition();

  const interactive = canMarkComplete && Boolean(token);

  const stepsByPhase = useMemo(() => {
    const map: Record<PhaseId, InductionStepView[]> = {
      pre: [],
      day1: [],
      day2: [],
      day3: [],
    };
    const sorted = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);
    for (const s of sorted) {
      map[bucketFor(dayDiff(s.dueDate, startDate))].push(s);
    }
    return map;
  }, [steps, startDate]);

  // Phase lock state: a phase is locked if any prior phase has incomplete steps.
  // Skipped entirely when enforceLocking is false (manager preview mode).
  const lockedPhases = useMemo<Set<PhaseId>>(() => {
    const locked = new Set<PhaseId>();
    if (!enforceLocking) return locked;
    let priorIncomplete = false;
    for (const p of PHASES) {
      if (priorIncomplete) locked.add(p.id);
      const phaseSteps = stepsByPhase[p.id];
      const allDone =
        phaseSteps.length > 0 &&
        phaseSteps.every((s) => s.status === "Completed");
      if (phaseSteps.length > 0 && !allDone) {
        priorIncomplete = true;
      }
    }
    return locked;
  }, [stepsByPhase, enforceLocking]);

  const total = steps.length;
  const completeCount = steps.filter((s) => s.status === "Completed").length;
  const progressPct = total > 0 ? Math.round((completeCount / total) * 100) : 0;

  const openStep =
    openStepId !== null ? steps.find((s) => s.id === openStepId) ?? null : null;
  const openStepPhase = openStep
    ? bucketFor(dayDiff(openStep.dueDate, startDate))
    : null;
  const openStepLocked = openStepPhase ? lockedPhases.has(openStepPhase) : false;

  function toggleSection(id: PhaseId) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function markComplete(stepId: number) {
    if (!interactive || !token) return;
    if (stepId <= 0) return;
    setPendingIds((p) => new Set(p).add(stepId));
    setErrors((e) => {
      const next = new Map(e);
      next.delete(stepId);
      return next;
    });
    startTransition(async () => {
      const result = await markStepCompleteByToken(stepId, token);
      setPendingIds((p) => {
        const next = new Set(p);
        next.delete(stepId);
        return next;
      });
      if (!result.ok) {
        setErrors((e) => new Map(e).set(stepId, result.error ?? "Failed"));
      }
    });
  }

  function submitEvidence(stepId: number, file: File): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!interactive || !token) {
        resolve({ ok: false, error: "Not authorized." });
        return;
      }
      if (stepId <= 0) {
        resolve({ ok: false, error: "Invalid step." });
        return;
      }
      setPendingIds((p) => new Set(p).add(stepId));
      setErrors((e) => {
        const next = new Map(e);
        next.delete(stepId);
        return next;
      });
      startTransition(async () => {
        const fd = new FormData();
        fd.append("stepId", String(stepId));
        fd.append("token", token);
        fd.append("file", file);
        const result = await submitStepEvidenceByToken(fd);
        setPendingIds((p) => {
          const next = new Set(p);
          next.delete(stepId);
          return next;
        });
        if (!result.ok) {
          setErrors((e) => new Map(e).set(stepId, result.error ?? "Upload failed"));
          resolve({ ok: false, error: result.error });
        } else {
          resolve({ ok: true });
        }
      });
    });
  }

  return (
    <div className="w-full bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <header className="border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {completeCount}/{total}
              </span>
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-800">
              <Award className="h-3.5 w-3.5 text-amber-500" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">{progressPct}%</span>
              <span className="text-slate-400">complete</span>
            </div>
          </div>
        </div>
      </header>

      {/* Workflow area — full width, horizontal swimlanes with 50px gaps */}
      <div className="overflow-x-auto px-6 py-6">
        <div className="flex flex-col" style={{ gap: "50px" }}>
          {PHASES.map((phase) => (
            <SwimlaneRow
              key={phase.id}
              phase={phase}
              steps={stepsByPhase[phase.id]}
              startDate={startDate}
              isLocked={lockedPhases.has(phase.id)}
              onCardClick={(id) => setOpenStepId(id)}
              onChipClick={markComplete}
              pendingIds={pendingIds}
              errors={errors}
              interactive={interactive}
              substepsByParent={substepsByParent}
              templateKey={templateKey}
              canManageSubsteps={canManageSubsteps}
              currentDepartmentId={currentDepartmentId}
              departments={departments}
            />
          ))}
        </div>
      </div>

      {/* Checklist panel — full-width below the workflow */}
      <aside className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-3 dark:border-slate-800">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <ClipboardList className="h-4 w-4" />
            Checklist
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {completeCount} of {total} done
            </span>
            <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{progressPct}%</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2 xl:grid-cols-4">
          {PHASES.map((phase) => {
            const phaseSteps = stepsByPhase[phase.id];
            const phaseDone = phaseSteps.filter(
              (s) => s.status === "Completed",
            ).length;
            const isOpen = expanded[phase.id];
            const isLocked = lockedPhases.has(phase.id);
            return (
              <div
                key={phase.id}
                className={`rounded-lg border bg-slate-50/40 dark:bg-slate-800/40 ${
                  isLocked ? "border-slate-200 opacity-70 dark:border-slate-800" : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleSection(phase.id)}
                  className="flex w-full items-center justify-between rounded-t-lg px-3 py-2 text-left transition hover:bg-slate-100/60 dark:hover:bg-slate-800/60"
                >
                  <span className="flex items-center gap-1.5">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                    <span className={`text-xs font-bold ${phase.text}`}>
                      {phase.emoji} {phase.label}
                    </span>
                    {isLocked && <Lock className="h-3 w-3 text-slate-400" />}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">
                    {phaseDone}/{phaseSteps.length}
                  </span>
                </button>
                {isOpen && (
                  <ul className="space-y-0.5 px-2 pb-2">
                    {phaseSteps.length === 0 ? (
                      <li className="px-2 py-1 text-[11px] italic text-slate-400">
                        No tasks in this phase.
                      </li>
                    ) : (
                      phaseSteps.map((s) => {
                        const status = statusOf(s.status);
                        const sStyles = statusStyles(status);
                        const StatusIcon = sStyles.icon;
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => setOpenStepId(s.id)}
                              className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-white dark:hover:bg-slate-800"
                              title="Open task details"
                            >
                              <span
                                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  status === "complete"
                                    ? "border-emerald-500 bg-emerald-500"
                                    : status === "in-progress"
                                      ? "border-amber-500 bg-amber-50 dark:bg-amber-900"
                                      : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950"
                                }`}
                              >
                                {status === "complete" && (
                                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                                )}
                                {status === "in-progress" && (
                                  <StatusIcon className="h-2.5 w-2.5 text-amber-600 dark:text-amber-300" />
                                )}
                              </span>
                              <span
                                className={`flex-1 text-xs leading-snug ${
                                  status === "complete"
                                    ? "text-slate-400 line-through"
                                    : "text-slate-700 dark:text-slate-300"
                                }`}
                              >
                                {s.stepNumber}. {s.title}
                              </span>
                              {s.evidenceFileId && (
                                <Paperclip className="h-3 w-3 shrink-0 text-emerald-600" />
                              )}
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {openStep && openStepPhase && (
        <StepDetailModal
          step={openStep}
          phase={PHASES.find((p) => p.id === openStepPhase) ?? PHASES[1]}
          dayLabel={shortDate(openStep.dueDate)}
          interactive={interactive && openStep.status !== "Completed" && openStep.id > 0}
          isLocked={openStepLocked}
          isPending={pendingIds.has(openStep.id)}
          errorMsg={errors.get(openStep.id) ?? null}
          onClose={() => setOpenStepId(null)}
          onSubmitEvidence={(file) => submitEvidence(openStep.id, file)}
        />
      )}
    </div>
  );
}

function SwimlaneRow({
  phase,
  steps,
  startDate,
  isLocked,
  onCardClick,
  onChipClick,
  pendingIds,
  errors,
  interactive,
  substepsByParent,
  templateKey,
  canManageSubsteps,
  currentDepartmentId,
  departments,
}: {
  phase: Phase;
  steps: InductionStepView[];
  startDate: string;
  isLocked: boolean;
  onCardClick: (id: number) => void;
  onChipClick: (id: number) => void;
  pendingIds: Set<number>;
  errors: Map<number, string>;
  interactive: boolean;
  substepsByParent: Record<number, SubstepView[]>;
  templateKey?: string;
  canManageSubsteps: boolean;
  currentDepartmentId: number | null;
  departments: DepartmentOption[];
}) {
  const PhaseIcon = phase.icon;
  const phaseDone = steps.filter((s) => s.status === "Completed").length;
  const allDone = steps.length > 0 && phaseDone === steps.length;

  return (
    <div className="relative">
      {isLocked && (
        <div className="absolute -top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-slate-700 px-2.5 py-0.5 text-[10px] font-bold text-white shadow">
          <Lock className="h-3 w-3" />
          Locked — finish previous phase first
        </div>
      )}
      <div className={`flex items-stretch gap-6 ${isLocked ? "opacity-60" : ""}`}>
        {/* Phase label on left */}
        <div className="flex w-40 shrink-0 flex-col justify-center">
          <div
            className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${phase.accent} px-3 py-1.5 text-white shadow-sm`}
          >
            <PhaseIcon className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold tracking-wide">{phase.label}</span>
          </div>
          <p className="mt-1.5 pl-2 text-[10px] text-slate-400">
            {steps.length} task{steps.length === 1 ? "" : "s"} · {phaseDone} done
          </p>
          {allDone && (
            <p className="mt-0.5 pl-2 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ Phase complete
            </p>
          )}
        </div>

        {/* Cards track with connecting line */}
        <div className="relative flex-1">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded-full"
            style={{
              background: `linear-gradient(to right, ${phase.strokeFrom}, ${phase.strokeTo})`,
              opacity: 0.4,
            }}
          />
          <div className="relative flex items-center gap-5 pt-6 pb-2">
            {steps.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-3 text-xs italic text-slate-400 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
                No tasks in this phase.
              </div>
            ) : (
              steps.map((s) => (
                <StepCard
                  key={s.id}
                  step={s}
                  phase={phase}
                  startDate={startDate}
                  isLocked={isLocked}
                  onClick={() => onCardClick(s.id)}
                  onChipClick={() => onChipClick(s.id)}
                  isPending={pendingIds.has(s.id)}
                  errorMsg={errors.get(s.id) ?? null}
                  interactive={interactive}
                  substeps={substepsByParent[s.stepNumber] ?? []}
                  templateKey={templateKey}
                  canManageSubsteps={canManageSubsteps}
                  currentDepartmentId={currentDepartmentId}
                  departments={departments}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// A step is "buildable" if it's a placeholder where departments/branches add
// their own sub-tasks (Department Training, 3-Week Branch Training). Detected
// by title so we don't have to hardcode step numbers per template.
function isBuildableStep(step: InductionStepView): boolean {
  const t = step.title.toLowerCase();
  return t.includes("department training") || t.includes("3-week branch training");
}

function StepCard({
  step,
  phase,
  startDate,
  isLocked,
  onClick,
  onChipClick,
  isPending,
  errorMsg,
  interactive,
  substeps,
  templateKey,
  canManageSubsteps,
  currentDepartmentId,
  departments,
}: {
  step: InductionStepView;
  phase: Phase;
  startDate: string;
  isLocked: boolean;
  onClick: () => void;
  onChipClick: () => void;
  isPending: boolean;
  errorMsg: string | null;
  interactive: boolean;
  substeps: SubstepView[];
  templateKey?: string;
  canManageSubsteps: boolean;
  currentDepartmentId: number | null;
  departments: DepartmentOption[];
}) {
  const status = statusOf(step.status);
  const styles = statusStyles(status);
  const StatusIcon = styles.icon;
  const kind = detectKind(step);
  const reqLabel = `REQ-${String(step.stepNumber).padStart(3, "0")}`;
  const days = dayDiff(step.dueDate, startDate);
  const dayBadge = days < 0 ? `Day ${days}` : `Day ${days + 1}`;
  const due = shortDate(step.dueDate);
  const buildable = isBuildableStep(step);
  const [showAddSubstep, setShowAddSubstep] = useState(false);

  const KindIcon =
    kind === "quiz" ? Gamepad2 : kind === "submission" ? Upload : null;
  const kindLabel = kind === "quiz" ? "GAME" : kind === "submission" ? "SUBMIT" : null;
  const kindBadgeClass =
    kind === "quiz"
      ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900 dark:text-rose-200 dark:ring-rose-700"
      : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:ring-amber-700";

  // For locked or completed cards, the chip just opens the modal (no direct
  // mark-complete). For active pending cards, chip click opens the modal too —
  // evidence is required so we never mark-complete without going through it.
  // We keep the chip clickable as a visual affordance; the actual upload
  // happens in the modal.
  const chipOpensModal = true;

  return (
    <div className="relative shrink-0">
      {/* REQ bubble */}
      <div className="absolute -top-5 right-2 z-10 flex flex-col items-center">
        <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white shadow ring-2 ring-white dark:ring-slate-900">
          {reqLabel}
        </span>
        <span className="h-3 w-px bg-rose-300 dark:bg-rose-700" aria-hidden="true" />
      </div>

      <button
        type="button"
        onClick={() => {
          // Manager clicking a buildable card → straight into the builder.
          // Everyone else → existing detail/evidence modal flow.
          if (buildable && canManageSubsteps && templateKey) {
            setShowAddSubstep(true);
          } else {
            onClick();
          }
        }}
        className={`group relative flex w-56 flex-col gap-2 rounded-xl bg-white p-4 text-left shadow-md ring-1 transition dark:bg-slate-900 ${styles.ring} ${
          isLocked ? "cursor-not-allowed" : "hover:-translate-y-0.5 hover:shadow-lg"
        }`}
        style={
          kind === "submission"
            ? {
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(245,158,11,0.05) 8px, rgba(245,158,11,0.05) 16px)",
              }
            : undefined
        }
      >
        <div className="flex items-center justify-between">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${phase.accent} text-sm font-bold text-white shadow-sm`}
          >
            {step.stepNumber}
          </span>
          <span
            role={interactive && !isLocked && status !== "complete" ? "button" : undefined}
            tabIndex={interactive && !isLocked && status !== "complete" ? 0 : -1}
            onClick={(e) => {
              if (chipOpensModal) return;
              e.stopPropagation();
              if (interactive && !isLocked && !isPending) onChipClick();
            }}
            onKeyDown={(e) => {
              if (chipOpensModal) return;
              if (
                interactive &&
                !isLocked &&
                !isPending &&
                (e.key === "Enter" || e.key === " ")
              ) {
                e.preventDefault();
                e.stopPropagation();
                onChipClick();
              }
            }}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${styles.chip} ${
              isPending ? "opacity-60" : ""
            }`}
            title={
              isLocked
                ? "Locked — complete previous phase first"
                : status === "complete"
                  ? "Already complete"
                  : "Click card to upload evidence"
            }
          >
            <StatusIcon className="h-3 w-3" />
            {isPending ? "Saving…" : styles.label}
          </span>
        </div>

        <div>
          <h3 className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
            {step.title}
          </h3>
          {step.description && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
              {step.description}
            </p>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 text-[10px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span
            className={`rounded-md px-1.5 py-0.5 font-semibold ${phase.text} bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-800`}
          >
            {dayBadge}
          </span>
          {due && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {due}
            </span>
          )}
          {KindIcon && kindLabel && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-bold ring-1 ${kindBadgeClass}`}
            >
              <KindIcon className="h-2.5 w-2.5" />
              {kindLabel}
            </span>
          )}
          {step.evidenceFileId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900 dark:text-emerald-200 dark:ring-emerald-700">
              <Paperclip className="h-2.5 w-2.5" />
              Evidence
            </span>
          )}
        </div>

        {errorMsg && (
          <p className="inline-flex items-start gap-1 text-[10px] text-red-700 dark:text-red-400">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>{errorMsg}</span>
          </p>
        )}

        <span
          className={`absolute inset-x-0 bottom-0 h-1 rounded-b-xl ${styles.bar}`}
          aria-hidden="true"
        />

        {isLocked && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-white/60 dark:bg-slate-900/60">
            <Lock className="h-6 w-6 text-slate-500 dark:text-slate-400" />
          </span>
        )}
      </button>

      {/* Auto-generated sub-workflow — renders the dept/branch-defined
          sub-tasks as a creative mini-flow under the parent card. Empty
          state is just a hint chip (managers click the parent card itself
          to open the builder, no extra button). */}
      {buildable && (
        <div className="mt-4">
          {/* Curved S-link from parent card down into the first sub-card */}
          <div className="flex justify-center" aria-hidden="true">
            <svg width="20" height="18" viewBox="0 0 20 18" className="text-slate-300 dark:text-slate-600">
              <path
                d="M 10 0 Q 10 9 18 9 Q 10 9 10 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {substeps.length === 0 ? (
            canManageSubsteps && templateKey ? (
              <div
                className={`mx-auto inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${phase.accent} px-3 py-1 text-[10px] font-bold text-white shadow-sm`}
              >
                <span>👆</span>
                <span>Click card to build sub-workflow</span>
              </div>
            ) : null
          ) : (
            // -mx-3 lets the sub-workflow extend slightly beyond the parent
            // card width — visually anchors it as a child container while
            // keeping enough breathing room for evidence chips on each step.
            <div className="-mx-3 w-[calc(100%+1.5rem)]">
              <div className="mb-2 flex items-center justify-between gap-2 px-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${phase.accent} px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm`}
                >
                  ✨ Auto-generated · {substeps.length} step
                  {substeps.length === 1 ? "" : "s"}
                </span>
                {canManageSubsteps && templateKey && (
                  <span className="text-[10px] font-medium text-slate-400">
                    Click parent to edit
                  </span>
                )}
              </div>

              {/* Creative mini-flow: each sub-step is its own little card with
                  evidence-type chip and a numbered badge. Connectors curl in
                  to make the flow feel hand-drawn rather than spreadsheet-y. */}
              <ol className="space-y-1.5 px-3">
                {substeps.map((sub, idx) => {
                  const ev = EVIDENCE_META[sub.evidenceType] ?? EVIDENCE_META.photo;
                  return (
                    <li key={sub.id} className="relative">
                      <div
                        className={`group relative overflow-hidden rounded-xl bg-white p-3 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-800 ${phase.ring}`}
                      >
                        {/* Phase-tinted accent bar down the left edge */}
                        <span
                          className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${phase.accent}`}
                          aria-hidden="true"
                        />
                        <div className="ml-2 flex items-start gap-2.5">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${phase.accent} text-xs font-black text-white shadow ring-2 ring-white dark:ring-slate-800`}
                          >
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                                {sub.title}
                              </p>
                              <span
                                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ${ev.accent}`}
                                title={ev.instruction}
                              >
                                <span>{ev.emoji}</span>
                                <span>{ev.label.toUpperCase()}</span>
                              </span>
                            </div>
                            {sub.description && (
                              <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                                {sub.description}
                              </p>
                            )}
                            <p className="mt-1 text-[9px] italic text-slate-400">
                              {ev.instruction}
                            </p>
                          </div>
                        </div>
                      </div>
                      {/* Decorative dotted connector to next sub-card */}
                      {idx < substeps.length - 1 && (
                        <div className="flex justify-center" aria-hidden="true">
                          <div className="my-0.5 h-3 border-l-2 border-dotted border-slate-300 dark:border-slate-600" />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      )}

      {showAddSubstep && templateKey && (
        <ManageSubstepsModal
          templateKey={templateKey}
          parentStepNumber={step.stepNumber}
          parentTitle={step.title}
          existingSubsteps={substeps}
          departmentId={currentDepartmentId}
          departments={departments}
          onClose={() => setShowAddSubstep(false)}
        />
      )}
    </div>
  );
}

function ManageSubstepsModal({
  templateKey,
  parentStepNumber,
  parentTitle,
  existingSubsteps,
  departmentId,
  departments,
  onClose,
}: {
  templateKey: string;
  parentStepNumber: number;
  parentTitle: string;
  existingSubsteps: SubstepView[];
  departmentId: number | null;
  departments: DepartmentOption[];
  onClose: () => void;
}) {
  const [, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceType, setEvidenceType] = useState<SubstepEvidence>("photo");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Step title is required.");
      return;
    }
    setPending(true);
    const fd = new FormData();
    fd.append("template_key", templateKey);
    fd.append("parent_step_number", String(parentStepNumber));
    fd.append("title", title.trim());
    fd.append("description", description.trim());
    fd.append("evidence_type", evidenceType);
    if (departmentId !== null) {
      fd.append("department_id", String(departmentId));
    }
    startTransition(async () => {
      const res = await addSubstepTemplate(fd);
      setPending(false);
      if (!res.ok) {
        setError(res.error ?? "Could not save.");
        return;
      }
      // Reset form for adding the next step without closing the modal.
      // Keep the evidence type sticky — depts usually re-use the same type
      // for multiple consecutive steps.
      setTitle("");
      setDescription("");
      titleInputRef.current?.focus();
    });
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this step?")) return;
    setPending(true);
    startTransition(async () => {
      const res = await deleteSubstepTemplate(id);
      setPending(false);
      if (!res.ok) setError(res.error ?? "Could not delete.");
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900 dark:ring-1 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-slate-900 to-slate-700 px-6 py-5 text-white">
          <p className="text-xs font-medium uppercase tracking-wider text-white/70">
            Workflow builder · {existingSubsteps.length} step
            {existingSubsteps.length === 1 ? "" : "s"}
          </p>
          <h2 className="mt-1 truncate text-lg font-bold">{parentTitle}</h2>
          {departmentId !== null ? (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white">
              🏢 Authoring for:{" "}
              {departments.find((d) => d.id === departmentId)?.name ?? `Dept #${departmentId}`}
            </p>
          ) : (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-400/30 px-2.5 py-0.5 text-[11px] font-semibold text-amber-50 ring-1 ring-amber-200/40">
              ⚠ No department selected — pick one in the dashboard dropdown first
            </p>
          )}
          <p className="mt-2 text-xs text-white/70">
            Add the steps employees in this department should complete. They&rsquo;ll
            render as an auto-generated sub-workflow under the parent card, and
            inductees in this department will see them automatically.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Existing steps */}
          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/60">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Current steps
            </p>
            {existingSubsteps.length === 0 ? (
              <p className="mt-2 text-sm italic text-slate-500 dark:text-slate-400">
                No steps yet — add the first one below.
              </p>
            ) : (
              <ol className="mt-3 space-y-2">
                {existingSubsteps.map((sub, idx) => {
                  const ev = EVIDENCE_META[sub.evidenceType] ?? EVIDENCE_META.photo;
                  return (
                    <li
                      key={sub.id}
                      className="flex items-start gap-3 rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white dark:bg-slate-700">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{sub.title}</p>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${ev.accent}`}
                          >
                            <span>{ev.emoji}</span>
                            {ev.label}
                          </span>
                        </div>
                        {sub.description && (
                          <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
                            {sub.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(sub.id)}
                        disabled={pending}
                        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900"
                        title="Delete this step"
                      >
                        Delete
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Add-new form */}
          <form onSubmit={handleAdd} className="space-y-4 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Add a step
            </p>
            <div>
              <label
                htmlFor="substep-title"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Step title<span className="text-red-500 dark:text-red-400"> *</span>
              </label>
              <input
                ref={titleInputRef}
                id="substep-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                autoFocus
                placeholder="e.g. Shadow a senior on a real call"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
              />
            </div>
            <div>
              <label
                htmlFor="substep-description"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Description (optional)
              </label>
              <textarea
                id="substep-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Notes, expected outcome, links…"
                className="mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                What should the employee submit as proof?
              </label>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                Pick the evidence type you want for completing this sub-task.
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  ["photo", "video", "screenshot", "document", "text", "none"] as const
                ).map((opt) => {
                  const meta = EVIDENCE_META[opt];
                  const active = evidenceType === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setEvidenceType(opt)}
                      className={
                        active
                          ? `inline-flex flex-col items-start gap-0.5 rounded-lg border-2 border-slate-900 bg-slate-50 px-2.5 py-2 text-left text-xs font-bold text-slate-900 shadow-sm dark:border-slate-100 dark:bg-slate-800 dark:text-slate-100`
                          : "inline-flex flex-col items-start gap-0.5 rounded-lg border-2 border-transparent bg-slate-50 px-2.5 py-2 text-left text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-white dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700"
                      }
                    >
                      <span className="flex items-center gap-1">
                        <span>{meta.emoji}</span>
                        <span>{meta.label}</span>
                      </span>
                      <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                        {meta.instruction}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-900 dark:text-red-200 dark:ring-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={pending || !title.trim() || departmentId === null}
                title={
                  departmentId === null
                    ? "Pick a department in the dashboard dropdown before adding steps"
                    : undefined
                }
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                {pending ? "Saving…" : "+ Add step"}
              </button>
            </div>
          </form>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3 dark:border-slate-800 dark:bg-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function StepDetailModal({
  step,
  phase,
  dayLabel,
  interactive,
  isLocked,
  isPending,
  errorMsg,
  onClose,
  onSubmitEvidence,
}: {
  step: InductionStepView;
  phase: Phase;
  dayLabel: string;
  interactive: boolean;
  isLocked: boolean;
  isPending: boolean;
  errorMsg: string | null;
  onClose: () => void;
  onSubmitEvidence: (file: File) => Promise<{ ok: boolean; error?: string }>;
}) {
  const status = statusOf(step.status);
  const styles = statusStyles(status);
  const reqLabel = `REQ-${String(step.stepNumber).padStart(3, "0")}`;
  const kind = detectKind(step);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Object URL for the local file preview, derived from the selected file.
  // The effect only revokes it on change/unmount — no setState in the effect.
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function pickFile(f: File | null) {
    setLocalError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!/\.(jpe?g|png)$/i.test(f.name)) {
      setLocalError("Photo must be JPG or PNG.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setLocalError("Photo exceeds 10MB.");
      return;
    }
    setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    const result = await onSubmitEvidence(file);
    if (result.ok) {
      setFile(null);
      onClose();
    }
    // errors surface via the parent `errors` map (shown on the card too)
  }

  const showUploadForm = interactive && !isLocked && status !== "complete";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900 dark:ring-1 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`bg-gradient-to-r ${phase.accent} px-6 py-5 text-white`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-white/80">
                {reqLabel} · Step {step.stepNumber} · {phase.label}
              </p>
              <h2 className="mt-0.5 text-lg font-bold">{step.title}</h2>
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

        <div className="space-y-4 px-6 py-5">
          {step.description && (
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{step.description}</p>
          )}

          {kind === "quiz" && (
            <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 ring-1 ring-rose-200 dark:bg-rose-900 dark:text-rose-200 dark:ring-rose-700">
              <span className="font-semibold">🎮 Quiz / game.</span> Complete the activity, then
              upload a screenshot of your result as evidence.
            </div>
          )}
          {kind === "submission" && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:ring-amber-700">
              <span className="font-semibold">📤 Submission required.</span> Upload your evidence
              photo (JPG/PNG, max 10MB).
            </div>
          )}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Responsible
              </dt>
              <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                {step.responsibleName ?? "Unassigned"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Due
              </dt>
              <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">{dayLabel || "—"}</dd>
            </div>
          </dl>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Status
            </dt>
            <dd className="mt-1.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ${styles.chip}`}
              >
                {styles.label}
              </span>
              {step.completedAt && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  on {shortDate(step.completedAt)}
                </span>
              )}
              {step.evidenceFileId && status === "complete" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900 dark:text-emerald-200 dark:ring-emerald-700">
                  <Paperclip className="h-3 w-3" />
                  Evidence on file
                </span>
              )}
            </dd>
          </div>

          {isLocked && (
            <div className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This step is locked. Finish all tasks in the previous phase before submitting
                evidence here.
              </span>
            </div>
          )}

          {showUploadForm && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Photo evidence (required)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              {previewUrl ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Evidence preview"
                    className="max-h-48 w-full rounded-md object-contain ring-1 ring-slate-200 dark:ring-slate-700"
                  />
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span className="truncate">📎 {file?.name}</span>
                    <button
                      type="button"
                      onClick={() => pickFile(null)}
                      className="text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <ImageIcon className="h-4 w-4" />
                  Choose photo (JPG/PNG)
                </button>
              )}
              {localError && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-400">
                  <AlertCircle className="h-3 w-3" /> {localError}
                </p>
              )}
            </div>
          )}

          {(errorMsg || localError) && !showUploadForm && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-900 dark:text-red-200 dark:ring-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg ?? localError}</span>
            </div>
          )}
          {errorMsg && showUploadForm && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-900 dark:text-red-200 dark:ring-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3 dark:border-slate-800 dark:bg-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Close
          </button>
          {showUploadForm && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {isPending ? "Uploading…" : "Upload Evidence & Mark Complete"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

