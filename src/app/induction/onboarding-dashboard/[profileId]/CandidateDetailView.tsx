"use client";

import Link from "next/link";
import { initialsFromName } from "@/lib/text";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Home } from "lucide-react";
import { InductionTrainingEmbed } from "@/app/induction/components/InductionTrainingEmbed";
import { BranchOnboardingSection } from "@/app/induction/components/BranchOnboardingSection";
import { CompletionBanner } from "@/app/induction/components/CompletionBanner";
import { AssignRoleModal, type ActiveUserOption } from "@/app/induction/components/AssignRoleModal";
import {
  DAY1_TASKS,
  DAY2_TASKS,
  DAY3_TASKS,
  typeForWorkflowTemplate,
  type SpecTask,
  type EmployeeTypeKey,
} from "@/lib/induction-task-spec";
import type {
  PendingInductionRow,
  DepartmentOption,
} from "@/app/induction/queries";
import type { BranchOpt } from "@/lib/employeeQueries";
import type { AssignmentForCandidate } from "@/lib/workflow/queries";
import { assignWorkflowToCandidate } from "@/app/dashboards/workflow-center/actions";

interface AssignableWorkflowOption {
  id: number;
  name: string;
  category: string;
}

interface Props {
  profile: PendingInductionRow;
  /** Map of DB step titles → completed=true. Lets us reconcile spec task
   *  list with actual saved state when DB titles match. */
  completedStepTitles: Set<string>;
  /** For Assign Role modal dropdowns. */
  branches: BranchOpt[];
  departments: DepartmentOption[];
  activeUsers: ActiveUserOption[];
  /** Candidate's currently-active workflow assignment (if any). */
  workflowAssignment: AssignmentForCandidate | null;
  /** Active Onboarding-category workflows matching the candidate's department. */
  assignableWorkflows: AssignableWorkflowOption[];
  /** Whether the viewer can assign a workflow (HR/HOD/superadmin). */
  canAssignWorkflow: boolean;
}

function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const TYPE_COLOR: Record<EmployeeTypeKey, { bg: string; text: string; ring: string }> = {
  "regular-intern": { bg: "bg-blue-100 dark:bg-blue-900", text: "text-blue-700 dark:text-blue-300", ring: "ring-blue-200 dark:ring-blue-700" },
  "protege-intern": { bg: "bg-violet-100 dark:bg-violet-900", text: "text-violet-700 dark:text-violet-300", ring: "ring-violet-200 dark:ring-violet-700" },
  "coach-part": { bg: "bg-amber-100 dark:bg-amber-900", text: "text-amber-700 dark:text-amber-300", ring: "ring-amber-200 dark:ring-amber-700" },
  "coach-full": { bg: "bg-emerald-100 dark:bg-emerald-900", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-200 dark:ring-emerald-700" },
  "fulltime-hq": { bg: "bg-rose-100 dark:bg-rose-900", text: "text-rose-700 dark:text-rose-300", ring: "ring-rose-200 dark:ring-rose-700" },
};

export function CandidateDetailView({
  profile,
  completedStepTitles,
  branches,
  departments,
  activeUsers,
  workflowAssignment,
  assignableWorkflows,
  canAssignWorkflow,
}: Props) {
  const router = useRouter();
  const [activeDay, setActiveDay] = useState<1 | 2 | 3>(1);
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  const type = typeForWorkflowTemplate(profile.workflowTemplate);
  const color = TYPE_COLOR[type.key];

  // Per spec: status mapping for read-only checklist display
  // - Completed: every box ticked
  // - In Progress: reflect DB saved state
  // - Sent: all empty
  const isCompletedStatus = profile.status === "Completed";
  const isSentStatus = profile.status === "Sent" || profile.status === "Created";

  function isTaskTicked(task: SpecTask): boolean {
    if (isCompletedStatus) return true;
    if (isSentStatus) return false;
    // In Progress: check if DB has a completed step with matching title
    return completedStepTitles.has(task.title);
  }

  const day1Tasks = DAY1_TASKS;
  const day2Tasks = DAY2_TASKS[type.key];
  const day3Tasks = DAY3_TASKS[type.key];

  function dayCompletion(tasks: SpecTask[]): { done: number; total: number } {
    const done = tasks.filter((t) => isTaskTicked(t)).length;
    return { done, total: tasks.length };
  }

  const day1Stats = dayCompletion(day1Tasks);
  const day2Stats = dayCompletion(day2Tasks);
  const day3Stats = dayCompletion(day3Tasks);

  // Day-level completion = all CANDIDATE-actor tasks done (per spec definition)
  function dayCandidateActorComplete(tasks: SpecTask[]): boolean {
    return tasks
      .filter((t) => t.actor === "Candidate")
      .every((t) => isTaskTicked(t));
  }
  const day1CandComplete = dayCandidateActorComplete(day1Tasks);
  const day2CandComplete = dayCandidateActorComplete(day2Tasks);
  const day3CandComplete = dayCandidateActorComplete(day3Tasks);

  // 3-step stepper state
  const stepperDays = [
    { day: 1, label: "Day 1 / HQ", complete: day1CandComplete, active: !day1CandComplete },
    { day: 2, label: "Day 2 / By Type", complete: day2CandComplete, active: day1CandComplete && !day2CandComplete },
    { day: 3, label: "Day 3 / Completion", complete: day3CandComplete, active: day2CandComplete && !day3CandComplete },
  ];
  const overallPct = isCompletedStatus
    ? 100
    : profile.totalSteps > 0
      ? Math.round((profile.completedSteps / profile.totalSteps) * 100)
      : 0;

  const activeTasks =
    activeDay === 1 ? day1Tasks : activeDay === 2 ? day2Tasks : day3Tasks;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto px-6 pt-4 pb-10">
        {/* ── BREADCRUMB ── */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-3">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/induction/onboarding-dashboard?type=onboarding" className="hover:text-slate-900 dark:hover:text-slate-100">
            Onboarding
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Candidate Detail</span>
        </nav>

        {/* ── BACK BUTTON ── */}
        <div className="mb-4">
          <Link
            href="/induction/onboarding-dashboard?type=onboarding"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
          </Link>
        </div>

        {/* ── COMPLETION BANNER (conditional) ── */}
        {isCompletedStatus && (
          <CompletionBanner
            candidateName={profile.employeeName}
            onAssignRole={() => setAssignModalOpen(true)}
          />
        )}

        {/* ── CANDIDATE INFO CARD ── */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ring-2 ${color.bg} ${color.text} ${color.ring}`}
                aria-hidden="true"
              >
                {initialsFromName(profile.employeeName)}
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">{profile.employeeName}</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{profile.employeeEmail}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span>📅 Started {formatLongDate(profile.startDate)}</span>
                  <span aria-hidden="true">·</span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold ${color.bg} ${color.text}`}>
                    {type.label}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold ${
                    isCompletedStatus
                      ? "bg-emerald-50 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700"
                      : profile.status === "In Progress"
                        ? "bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700"
                        : "bg-amber-50 dark:bg-amber-900 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700"
                  }`}>
                    {profile.status}
                  </span>
                </div>
              </div>
            </div>
            {/* View as Candidate → button (Phase C will wire to candidate portal) */}
            <button
              type="button"
              disabled
              title="Candidate Portal — coming in Phase C"
              className="inline-flex items-center gap-1.5 rounded-md border-2 border-violet-300 dark:border-violet-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-violet-400 dark:text-violet-400 cursor-not-allowed"
            >
              🎓 View as Candidate →
            </button>
          </div>
        </section>

        {/* ── PROGRESS STEPPER + OVERALL BAR ── */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5">
          <ol className="flex items-start justify-between gap-2 mb-5" aria-label="Induction journey">
            {stepperDays.map((s, i) => (
              <li key={s.day} className="flex-1 flex items-start gap-2 min-w-0">
                <div className="flex flex-col items-center text-center flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
                      s.complete
                        ? "bg-blue-600 border-blue-600 text-white"
                        : s.active
                          ? "bg-blue-50 dark:bg-blue-900 border-blue-600 dark:border-blue-500 text-blue-700 dark:text-blue-300"
                          : "bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {s.complete ? "✓" : s.day}
                  </div>
                  <p className={`mt-2 text-xs font-semibold ${s.complete || s.active ? "text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-slate-300"}`}>
                    {s.label}
                  </p>
                </div>
                {i < stepperDays.length - 1 && (
                  <div className={`h-0.5 flex-1 mt-5 ${s.complete ? "bg-blue-500" : "bg-slate-200 dark:bg-slate-700"}`} aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Overall Induction Progress</p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">{overallPct}%</p>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>
        </section>

        {/* ── INDUCTION TRAINING EMBED ── */}
        <div className="mb-5">
          <InductionTrainingEmbed employeeTypeLabel={type.label} />
        </div>

        {/* ── DAY TABS CHECKLIST ── */}
        <section aria-labelledby="day-tabs-heading" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl mb-5 overflow-hidden">
          <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 id="day-tabs-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Day Tabs Checklist</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Read-only — HR cannot tick tasks. State reflects candidate&apos;s saved progress.</p>
          </header>
          <div className="flex border-b border-slate-200 dark:border-slate-800">
            <DayTab day={1} active={activeDay === 1} stats={day1Stats} onClick={() => setActiveDay(1)} label="Day 1 — HQ" />
            <DayTab day={2} active={activeDay === 2} stats={day2Stats} onClick={() => setActiveDay(2)} label="Day 2 — By Type" />
            <DayTab day={3} active={activeDay === 3} stats={day3Stats} onClick={() => setActiveDay(3)} label="Day 3 — Completion" />
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {activeTasks.map((task, i) => (
              <ReadOnlyTaskItem key={i} task={task} ticked={isTaskTicked(task)} />
            ))}
          </ul>
        </section>

        {/* ── 3-WEEK BRANCH ONBOARDING (conditional) ── */}
        {type.hasBranchOnboarding && (
          <div className="mb-5">
            <BranchOnboardingSection day3Complete={day3CandComplete} />
          </div>
        )}

        {/* ── DEPARTMENT WORKFLOW (conditional) ── */}
        {type.hasDepartmentWorkflow && day3CandComplete && (
          <div className="mb-5">
            <DepartmentWorkflowSection
              userId={profile.userId}
              workflowAssignment={workflowAssignment}
              assignableWorkflows={assignableWorkflows}
              canAssignWorkflow={canAssignWorkflow}
            />
          </div>
        )}

        {/* ── ASSIGN ROLE MODAL ── */}
        {assignModalOpen && (
          <AssignRoleModal
            profile={profile}
            branches={branches}
            departments={departments}
            activeUsers={activeUsers}
            onClose={() => setAssignModalOpen(false)}
            onSuccess={() => {
              setAssignModalOpen(false);
              router.push("/induction/onboarding-dashboard?type=onboarding");
            }}
          />
        )}
      </div>
    </div>
  );
}

function DayTab({
  label,
  active,
  stats,
  onClick,
}: {
  day: 1 | 2 | 3;
  label: string;
  active: boolean;
  stats: { done: number; total: number };
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex-1 px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center justify-center gap-2 ${
        active
          ? "border-blue-600 text-blue-700 dark:text-blue-300"
          : "border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
    >
      <span>{label}</span>
      <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
        active ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
      }`}>
        {stats.done}/{stats.total}
      </span>
    </button>
  );
}

function ReadOnlyTaskItem({ task, ticked }: { task: SpecTask; ticked: boolean }) {
  const isCandidate = task.actor === "Candidate";
  const actorClass =
    task.actor === "HR"
      ? "bg-slate-900 text-white"
      : task.actor === "Full-time Coach"
        ? "bg-slate-700 text-white"
        : "bg-slate-600 text-white";

  return (
    <li className="px-5 py-3 flex items-start gap-3">
      <div
        className={`w-5 h-5 mt-0.5 rounded border-2 shrink-0 flex items-center justify-center cursor-default ${
          ticked
            ? "bg-blue-600 border-blue-600 text-white"
            : "bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-600 opacity-40"
        }`}
        aria-hidden="true"
      >
        {ticked && (
          <span className="text-[11px] font-bold leading-none">✓</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${ticked ? "text-slate-500 dark:text-slate-400 line-through" : "text-slate-700 dark:text-slate-300"}`}>
          {task.title}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${actorClass}`}>
            {task.actor}
          </span>
          {!isCandidate && !ticked && (
            <span className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
              ⏳ Awaiting {task.actor}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

// ─── DepartmentWorkflowSection (HR view of the candidate's assigned workflow) ───
//
// Three states:
//   1. workflowAssignment present → show the workflow steps + per-step status
//   2. no assignment, canAssignWorkflow + assignableWorkflows.length > 0 →
//      show an "Assign Workflow" picker so HR/HOD can attach one manually
//   3. no assignment, nothing to assign → placeholder text per spec
function DepartmentWorkflowSection({
  userId,
  workflowAssignment,
  assignableWorkflows,
  canAssignWorkflow,
}: {
  userId: number;
  workflowAssignment: AssignmentForCandidate | null;
  assignableWorkflows: AssignableWorkflowOption[];
  canAssignWorkflow: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<number | null>(
    assignableWorkflows[0]?.id ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  if (workflowAssignment) {
    const done = workflowAssignment.steps.filter((s) => s.status === "Done").length;
    const total = workflowAssignment.steps.length;
    return (
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Department Workflow
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {workflowAssignment.workflowName} · {workflowAssignment.departmentName}
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
            {done}/{total} done
          </span>
        </header>
        {workflowAssignment.steps.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400 italic">
            This workflow has no steps yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {workflowAssignment.steps.map((s) => {
              const isDone = s.status === "Done";
              const isCandidateActor = s.actorRole === "Candidate";
              return (
                <li key={s.id} className="px-5 py-3 flex items-start gap-3">
                  <div
                    className={`w-5 h-5 mt-0.5 rounded border-2 shrink-0 flex items-center justify-center ${
                      isDone
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-600"
                    }`}
                    aria-hidden="true"
                  >
                    {isDone && <span className="text-[11px] font-bold leading-none">✓</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${isDone ? "text-slate-500 dark:text-slate-400 line-through" : "text-slate-700 dark:text-slate-300"}`}>
                      {s.title}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-700 text-white">
                        {s.actorRole}
                      </span>
                      {!isDone && !isCandidateActor && (
                        <span className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                          ⏳ Awaiting {s.actorRole}
                        </span>
                      )}
                      {isDone && s.completedByName && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">by {s.completedByName}</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  // No assignment yet. Two sub-states.
  if (!canAssignWorkflow || assignableWorkflows.length === 0) {
    return (
      <section className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center">
        <p className="text-3xl mb-2" aria-hidden="true">⚙️</p>
        <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300">Department Workflow</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
          Your department head has not published a workflow yet. Check back soon.
        </p>
      </section>
    );
  }

  // Can assign — render picker.
  const handleAssign = () => {
    if (selectedId === null) return;
    setError(null);
    startTransition(async () => {
      const result = await assignWorkflowToCandidate(selectedId, userId);
      if (!result.ok) {
        setError(result.error ?? "Could not assign.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
      <div className="text-center mb-4">
        <p className="text-2xl mb-1" aria-hidden="true">⚙️</p>
        <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300">Department Workflow</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          No workflow assigned yet. Pick one to assign to this candidate.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          className="rounded-md border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-950 dark:text-slate-100 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
        >
          {assignableWorkflows.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAssign}
          disabled={pending || selectedId === null}
          className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Assigning…" : "Assign Workflow"}
        </button>
      </div>
      {error && (
        <p className="mt-3 text-xs text-rose-700 dark:text-rose-300 text-center">{error}</p>
      )}
    </section>
  );
}
