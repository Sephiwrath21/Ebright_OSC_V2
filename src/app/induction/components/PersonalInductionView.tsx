import Link from "next/link";
import { WorkflowDiagram } from "./WorkflowDiagram";
import { TrainingChecklist } from "./TrainingChecklist";
import OnboardingWorkflow, {
  type SubstepView as WorkflowSubstepView,
} from "./OnboardingWorkflow";
import { CandidateWorkflowSection } from "./CandidateWorkflowSection";
import type { InductionView, SubstepTemplateView } from "@/app/induction/queries";
import type { AssignmentForCandidate } from "@/lib/workflow/queries";

interface PersonalInductionViewProps {
  profile: InductionView;
  canMarkComplete: boolean;
  substepTemplates: SubstepTemplateView[];
  /** Optional — assigned department workflow (from Workflow Center).
   *  Surfaced as its own section below the induction journey. */
  workflowAssignment?: AssignmentForCandidate | null;
}

// Inline copy of the server-only groupSubstepsByParent — filters by template
// + inductee's department so they only see their own department's sub-tasks.
function inducteeSubsteps(
  rows: SubstepTemplateView[],
  templateKey: string,
  departmentId: number | null,
): Record<number, WorkflowSubstepView[]> {
  const out: Record<number, WorkflowSubstepView[]> = {};
  for (const r of rows) {
    if (r.templateKey !== templateKey) continue;
    if (r.departmentId !== null && r.departmentId !== departmentId) continue;
    if (!out[r.parentStepNumber]) out[r.parentStepNumber] = [];
    out[r.parentStepNumber].push({
      id: r.id,
      title: r.title,
      description: r.description,
      evidenceType: r.evidenceType,
      departmentId: r.departmentId,
    });
  }
  return out;
}

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function PersonalInductionView({
  profile,
  canMarkComplete,
  substepTemplates,
  workflowAssignment = null,
}: PersonalInductionViewProps) {
  const total = profile.steps.length;
  const completed = profile.steps.filter((s) => s.status === "Completed").length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isComplete = total > 0 && completed === total;
  const isHalfway = total > 0 && completed >= Math.ceil(total / 2) && !isComplete;

  // Auto-attach: pick the sub-tasks for this inductee's template AND
  // their employment department. They never see other departments' workflows.
  const substepsByParent = inducteeSubsteps(
    substepTemplates,
    profile.workflowTemplate,
    profile.departmentId,
  );

  const isOffboarding = profile.inductionType === "Offboarding";

  const headline = isOffboarding
    ? `Farewell, ${profile.employeeName}.`
    : `Welcome, ${profile.employeeName}!`;

  const subline = isOffboarding
    ? `Your last working day is ${formatLongDate(profile.exitDate ?? profile.startDate)}.`
    : `You join ${profile.departmentName ?? "the team"} on ${formatLongDate(profile.startDate)}.`;

  const journeyTitle = isOffboarding ? "Offboarding Process" : "Onboarding Journey";

  return (
    <div className="h-full flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            {profile.inductionType}
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            {headline}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300">{subline}</p>

          {profile.buddyName && (
            <div className="mt-5 rounded-xl bg-amber-50 dark:bg-amber-900 border border-amber-200 dark:border-amber-700 px-4 py-3">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Your induction buddy is {profile.buddyName}
                {profile.buddyEmail && (
                  <>
                    {" — "}
                    <a
                      href={`mailto:${profile.buddyEmail}`}
                      className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
                    >
                      {profile.buddyEmail}
                    </a>
                  </>
                )}
              </p>
            </div>
          )}

          <div className="mt-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Progress</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {completed} of {total} steps complete
                </p>
              </div>
              <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{pct}%</span>
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            {isHalfway && (
              <p className="mt-3 rounded-md bg-amber-50 dark:bg-amber-900 border border-amber-200 dark:border-amber-700 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                You&rsquo;re halfway there — keep going!
              </p>
            )}
            {!canMarkComplete && (
              <p className="mt-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                Read-only view — sign in as the employee or HR to mark steps complete.
              </p>
            )}
          </div>
        </header>

        {isOffboarding ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
              <header className="mb-4">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{journeyTitle}</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Your end-to-end flow at a glance.
                </p>
              </header>
              <WorkflowDiagram steps={profile.steps} />
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
              <header className="mb-4">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Your checklist</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Mark each task complete as you go.
                </p>
              </header>
              <TrainingChecklist
                steps={profile.steps}
                token={profile.linkToken}
                canMarkComplete={canMarkComplete}
              />
            </section>
          </div>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <OnboardingWorkflow
              steps={profile.steps}
              startDate={profile.startDate}
              token={profile.linkToken}
              canMarkComplete={canMarkComplete}
              title={journeyTitle}
              subtitle="Your end-to-end flow — click any task to see details, or tick it off in the checklist."
              substepsByParent={substepsByParent}
              templateKey={profile.workflowTemplate}
              currentDepartmentId={profile.departmentId}
              canManageSubsteps={false}
            />
          </section>
        )}

        {/* Department Workflow (Workflow Center PR1) — only for onboarding.
            Renders the candidate's assigned department workflow with
            checkboxes on their own Candidate-actor tasks. Placeholder
            text when no workflow has been assigned to them yet. */}
        {!isOffboarding && <CandidateWorkflowSection assignment={workflowAssignment} />}

        {isComplete && (
          <footer className="rounded-2xl border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900 p-6 text-center">
            <h2 className="text-lg font-semibold text-emerald-900 dark:text-emerald-200">
              {isOffboarding ? "Offboarding Complete" : "Onboarding Complete!"}
            </h2>
            <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
              {isOffboarding
                ? "All exit steps are signed off. Wishing you the best for what comes next."
                : "You&rsquo;ve finished every step. Welcome aboard."}
            </p>
            <Link
              href="/dashboards/hrms"
              className="mt-4 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Return to HRMS
            </Link>
          </footer>
        )}

        <div className="text-center text-xs text-slate-400">
          This is your private induction link. Don&rsquo;t share it with others.
        </div>
      </div>
    </div>
  );
}
