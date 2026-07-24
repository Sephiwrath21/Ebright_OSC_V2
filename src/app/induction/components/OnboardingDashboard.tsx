"use client";

import Link from "next/link";
import { initialsFromName } from "@/lib/text";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Home,
  RefreshCw,
  UserMinus,
  UserPlus,
} from "lucide-react";
import {
  acceptInductionRequest,
  createInductionRequest,
  createInductionRequestForEbrightCandidate,
  declineInductionRequest,
} from "@/app/induction/actions";
import type {
  CombinedExitRow,
  CombinedHireRow,
  DepartmentOption,
  InductionStepView,
  InductionView,
  PendingInductionRequestRow,
  PendingInductionRow,
  SubstepTemplateView,
} from "@/app/induction/queries";
import type { BranchOpt } from "@/lib/employeeQueries";
import { AssignRoleModal, type ActiveUserOption } from "./AssignRoleModal";
import {
  CreateInductionProfileModal,
  type ModalState as CreateModalState,
} from "./CreateInductionProfileModal";
import type { InductionEmployeeOption } from "@/app/induction/queries";

// Inline copy of groupSubstepsByParent — queries.ts is server-only so its
// runtime helpers can't be imported into this client component.
// Filters by templateKey AND departmentId (null = global rows visible to all).
function groupSubstepsByParent(
  rows: SubstepTemplateView[],
  templateKey: string,
  departmentId: number | null,
): Record<number, SubstepTemplateView[]> {
  const out: Record<number, SubstepTemplateView[]> = {};
  for (const r of rows) {
    if (r.templateKey !== templateKey) continue;
    // Show rows that match the selected department OR rows with no department
    // (legacy globals). When no department is selected, only show globals.
    if (r.departmentId !== null && r.departmentId !== departmentId) continue;
    if (!out[r.parentStepNumber]) out[r.parentStepNumber] = [];
    out[r.parentStepNumber].push(r);
  }
  return out;
}
import {
  OFFBOARDING_WORKFLOW,
  WORKFLOW_TEMPLATES,
  workflowTemplateLabel,
  type WorkflowStepTemplate,
} from "@/app/induction/templates";

// Onboarding workflow paths (mirrors the 4 employee-type templates in
// templates.ts). Drives the tab switcher on the manager preview so HR can
// flip between the 4 reference workflows without leaving the page.
const EMPLOYEE_TYPE_TEMPLATES: ReadonlyArray<{
  key: string;
  short: string;
  location: string;
  accent: string; // tailwind gradient
}> = [
  { key: "Standard",            short: "Intern",              location: "HQ",                       accent: "from-sky-500 to-blue-600" },
  { key: "ProtegeInternBranch", short: "Protege Intern",      location: "Assigned Branch",          accent: "from-violet-500 to-indigo-600" },
  { key: "CoachPartTimer",      short: "Coach (Part-timer)",  location: "Branch + 3-week training", accent: "from-amber-500 to-orange-600" },
  { key: "FullTimer",           short: "Full-timer",          location: "HQ or Branch",             accent: "from-emerald-500 to-teal-600" },
];
import { WorkflowDiagram } from "./WorkflowDiagram";
import { TrainingChecklist } from "./TrainingChecklist";
import OnboardingWorkflow from "./OnboardingWorkflow";

// Synthetic "today" used as the start date when a manager previews the
// onboarding workflow without an active induction of their own. Lets the
// swimlane component bucket steps by `dueDate - startDate` consistently.
const PREVIEW_START_DATE = (() => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
})();

function previewDueDate(daysFromStart: number): string {
  const d = new Date(PREVIEW_START_DATE);
  d.setUTCDate(d.getUTCDate() + daysFromStart);
  return d.toISOString();
}

interface OnboardingDashboardProps {
  hires: CombinedHireRow[];
  exits: CombinedExitRow[];
  view?: "onboarding" | "offboarding" | "both";
  ownInduction: InductionView | null;
  isManager: boolean;
  substepTemplates: SubstepTemplateView[];
  departments: DepartmentOption[];
  /** Phase 2B: full onboarding profiles for stats + categories + table.
   *  Only populated when view === "onboarding". */
  onboardingProfiles?: PendingInductionRow[];
  /** Phase 2B: pending induction requests for the Pending Requests card. */
  pendingRequests?: PendingInductionRequestRow[];
  /** Phase 2B+: branches list for the Assign Role modal dropdown. */
  branches?: BranchOpt[];
  /** Phase 2B+: userId → branchName lookup for the Branch column in the
   *  candidates table. */
  branchByUserId?: Record<number, string | null>;
  /** userId → departmentName lookup for the Department column. */
  departmentByUserId?: Record<number, string | null>;
  /** Phase 2B+: active users (HR/HOD/etc) for the "Reports To" dropdown
   *  in the Assign Role modal. */
  activeUsers?: ActiveUserOption[];
  /** Phase B: eligible employees for the Create Induction Profile modal
   *  email-lookup. Only populated when view === "onboarding". */
  eligibleEmployees?: InductionEmployeeOption[];
}

// Phase 2B: 5 employee-type categories per spec v2. Keys map to
// `induction_profile.workflow_template` values; "CoachFullTimer" doesn't
// have a template seeded yet so its category will show 0/0 until one is
// added — that's expected.
const CATEGORIES: ReadonlyArray<{
  key: string;
  label: string;
  icon: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  barClass: string;
}> = [
  { key: "Standard",            label: "Intern",            icon: "👤", bgClass: "bg-blue-50",    borderClass: "border-blue-200",    textClass: "text-blue-700",    barClass: "bg-blue-500" },
  { key: "ProtegeInternBranch", label: "Protege Intern",    icon: "🌱", bgClass: "bg-violet-50",  borderClass: "border-violet-200",  textClass: "text-violet-700",  barClass: "bg-violet-500" },
  { key: "CoachPartTimer",      label: "Coach (Part-timer)", icon: "🎯", bgClass: "bg-amber-50",   borderClass: "border-amber-200",   textClass: "text-amber-700",   barClass: "bg-amber-500" },
  { key: "CoachFullTimer",      label: "Coach (Full-timer)", icon: "⭐", bgClass: "bg-emerald-50", borderClass: "border-emerald-200", textClass: "text-emerald-700", barClass: "bg-emerald-500" },
  { key: "FullTimer",           label: "Full-timer (HQ)",   icon: "🏢", bgClass: "bg-rose-50",    borderClass: "border-rose-200",    textClass: "text-rose-700",    barClass: "bg-rose-500" },
];

interface OnboardingStats {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
}

function computeOnboardingStats(profiles: PendingInductionRow[]): OnboardingStats {
  let total = 0, completed = 0, inProgress = 0, notStarted = 0;
  for (const p of profiles) {
    total += 1;
    if (p.status === "Completed") completed += 1;
    else if (p.status === "In Progress") inProgress += 1;
    else if (p.status === "Sent" || p.status === "Created") notStarted += 1;
  }
  return { total, completed, inProgress, notStarted };
}

function countProfilesByTemplate(
  profiles: PendingInductionRow[],
  templateKey: string,
): { total: number; completed: number } {
  let total = 0, completed = 0;
  for (const p of profiles) {
    if (p.workflowTemplate !== templateKey) continue;
    total += 1;
    if (p.status === "Completed") completed += 1;
  }
  return { total, completed };
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  return `${diffMo}mo ago`;
}

function statusBadgeClasses(status: string): string {
  if (status === "Completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "In Progress") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "Sent") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function categoryLabelForTemplate(templateKey: string): string {
  const cat = CATEGORIES.find((c) => c.key === templateKey);
  return cat?.label ?? templateKey;
}

function templateToPreviewSteps(
  template: readonly WorkflowStepTemplate[],
): InductionStepView[] {
  return template.map((t) => ({
    id: -t.stepNumber,
    stepNumber: t.stepNumber,
    title: t.title,
    description: t.description,
    responsibleName: null,
    responsibleEmail: null,
    // Synthetic dueDate so timeline-based UIs (e.g. OnboardingWorkflow
    // swimlanes) can still bucket preview-only steps.
    dueDate: previewDueDate(t.daysFromStart),
    status: "Pending",
    completedAt: null,
    evidenceFileId: null,
    evidenceUploadedAt: null,
  }));
}

function dayLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "in 1d";
  return `in ${days}d`;
}

export default function OnboardingDashboard({
  hires,
  exits,
  view = "both",
  ownInduction,
  isManager,
  substepTemplates,
  departments,
  onboardingProfiles,
  pendingRequests,
  branches,
  branchByUserId,
  departmentByUserId,
  activeUsers,
  eligibleEmployees,
}: OnboardingDashboardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [refreshing, setRefreshing] = useState(false);

  // Phase 2B state — category filter + search for the candidates table.
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // A5 — candidate-list filter bar (mirrors the Employee Dashboard): branch
  // + induction-status filters that stack with the category/search filters.
  const [branchFilter, setBranchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [requestActionPending, setRequestActionPending] = useState<Set<number>>(new Set());
  const [requestActionErrors, setRequestActionErrors] = useState<Map<number, string>>(new Map());
  // Phase 2B+ state — Assign Role modal target.
  const [assigningProfile, setAssigningProfile] = useState<PendingInductionRow | null>(null);
  // Phase B state — Create Induction Profile modal.
  const [createModalState, setCreateModalState] = useState<CreateModalState>({ mode: "closed" });

  const showOnboarding = view !== "offboarding";
  const showOffboarding = view !== "onboarding";

  // Phase 2B: only render the new HR layout when view is exactly "onboarding"
  // AND the page passed profiles + requests. Other views (offboarding, both)
  // keep the original layout untouched.
  const showHRLayout = view === "onboarding" && onboardingProfiles !== undefined;

  const profilesForStats = onboardingProfiles ?? [];
  const requestsForCard = pendingRequests ?? [];

  const stats = computeOnboardingStats(profilesForStats);

  // Branch dropdown options — distinct branch names present among candidates,
  // falling back to the full branch list passed from the server.
  const branchOptions = Array.from(
    new Set(
      profilesForStats
        .map((p) => branchByUserId?.[p.userId] ?? null)
        .filter((b): b is string => Boolean(b)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const filteredProfiles = profilesForStats.filter((p) => {
    if (categoryFilter && p.workflowTemplate !== categoryFilter) return false;
    if (branchFilter && (branchByUserId?.[p.userId] ?? "") !== branchFilter) return false;
    if (statusFilter) {
      // "Not Started" maps to the Sent/Created statuses (mirrors the stat box).
      const matchesStatus =
        statusFilter === "Not Started"
          ? p.status === "Sent" || p.status === "Created"
          : p.status === statusFilter;
      if (!matchesStatus) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${p.employeeName} ${p.employeeEmail}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const hasCandidateFilters = Boolean(
    searchQuery || branchFilter || statusFilter || categoryFilter,
  );
  const clearCandidateFilters = () => {
    setSearchQuery("");
    setBranchFilter("");
    setStatusFilter("");
    setCategoryFilter(null);
  };

  const handleAcceptRequest = (requestId: number) => {
    setRequestActionPending((p) => new Set(p).add(requestId));
    setRequestActionErrors((e) => {
      const next = new Map(e);
      next.delete(requestId);
      return next;
    });
    const matchingRequest = requestsForCard.find((r) => r.id === requestId);
    startTransition(async () => {
      const result = await acceptInductionRequest(requestId);
      setRequestActionPending((p) => {
        const next = new Set(p);
        next.delete(requestId);
        return next;
      });
      if (!result.ok) {
        setRequestActionErrors((e) =>
          new Map(e).set(requestId, result.error ?? "Failed to accept"),
        );
        return;
      }
      // Phase B: show the credential screen with the generated link
      if (result.trainingLink && matchingRequest) {
        const username =
          matchingRequest.email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
        const tempPassword = "eBright@" + String(Math.floor(1000 + Math.random() * 9000));
        // Source of truth: rebuild from the actual browser origin so the
        // link is reachable even if NEXTAUTH_URL or proxy headers point
        // at an internal IP. Falls back to the server-built trainingLink
        // if token isn't present for some reason.
        const loginLink =
          result.token
            ? `${window.location.origin}/induction/${result.token}`
            : result.trainingLink;
        // TODO: wire up real email send (Resend). Credentials are shown
        // on-screen via the credential modal only — never logged.
        setCreateModalState({
          mode: "credential",
          data: {
            candidateName: matchingRequest.fullName,
            candidateEmail: matchingRequest.email,
            username,
            tempPassword,
            loginLink,
          },
        });
      }
      router.refresh();
    });
  };

  const handleDeclineRequest = (requestId: number) => {
    setRequestActionPending((p) => new Set(p).add(requestId));
    setRequestActionErrors((e) => {
      const next = new Map(e);
      next.delete(requestId);
      return next;
    });
    startTransition(async () => {
      const result = await declineInductionRequest(requestId);
      setRequestActionPending((p) => {
        const next = new Set(p);
        next.delete(requestId);
        return next;
      });
      if (!result.ok) {
        setRequestActionErrors((e) =>
          new Map(e).set(requestId, result.error ?? "Failed to decline"),
        );
      } else {
        router.refresh();
      }
    });
  };

  const hiresUrgent = hires.filter((h) => h.isWithin7Days).length;
  const exitsUrgent = exits.filter((e) => e.isWithin7Days).length;

  const heading =
    view === "onboarding"
      ? "Onboarding"
      : view === "offboarding"
        ? "Offboarding"
        : "Onboarding & Offboarding";

  const subheading =
    view === "onboarding"
      ? "Manage and track new hire induction progress — eBright"
      : view === "offboarding"
        ? "Employees leaving within the next 2 weeks. Add them to the offboarding queue."
        : "Employees within ±1 week of joining, or leaving in the next 2 weeks.";

  const handleAddToQueue = (row: CombinedHireRow | CombinedExitRow) => {
    const key = row.key;
    setPending((p) => new Set(p).add(key));
    setErrors((e) => {
      const next = new Map(e);
      next.delete(key);
      return next;
    });
    startTransition(async () => {
      let result;
      if (row.source === "local" && row.userId !== null) {
        result = await createInductionRequest(row.userId);
      } else {
        // ebrightleads candidate — extract the source_id from `ebr-<id>`.
        const sourceId = parseInt(key.replace(/^ebr-/, ""), 10);
        result = await createInductionRequestForEbrightCandidate(sourceId);
      }
      setPending((p) => {
        const next = new Set(p);
        next.delete(key);
        return next;
      });
      if (!result.ok) {
        setErrors((e) => new Map(e).set(key, result.error ?? "Failed"));
      } else {
        // Successful queue — refresh server data so the row shows as Queued.
        router.refresh();
      }
    });
  };

  const handleRefresh = () => {
    setRefreshing(true);
    startTransition(() => {
      router.refresh();
      setTimeout(() => setRefreshing(false), 600);
    });
  };

  return (
    <div className="min-h-full bg-slate-50">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900">HRMS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Onboarding Dashboard</span>
        </nav>

        <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">{heading}</h1>
            <p className="mt-2 text-sm text-slate-600">{subheading}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh
            </button>
            {/* "+ New Candidate" button removed — Create Induction Profile
                is triggered from the Employee Dashboard instead. Modal
                + form logic stays so Accept-on-pending-request still
                renders the credential view in-place. */}
          </div>
        </header>

        {showHRLayout && (
          <>
            {/* ── 4 Stat Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <StatCard
                label="Total Active"
                value={stats.total}
                subtitle="Full active pipeline."
                accentClass="bg-blue-500"
                onClick={() => setStatusFilter("")}
                isActive={statusFilter === ""}
              />
              <StatCard
                label="Pre-Onboarding"
                value={stats.notStarted}
                subtitle="Link sent, awaiting start."
                accentClass="bg-rose-500"
                onClick={() => setStatusFilter((cur) => (cur === "Not Started" ? "" : "Not Started"))}
                isActive={statusFilter === "Not Started"}
              />
              <StatCard
                label="In Progress"
                value={stats.inProgress}
                subtitle="Actively training."
                accentClass="bg-amber-500"
                onClick={() => setStatusFilter((cur) => (cur === "In Progress" ? "" : "In Progress"))}
                isActive={statusFilter === "In Progress"}
              />
              <StatCard
                label="Post-Onboarding"
                value={stats.completed}
                subtitle="Induction done, pending role assignment."
                accentClass="bg-emerald-500"
                onClick={() => setStatusFilter((cur) => (cur === "Completed" ? "" : "Completed"))}
                isActive={statusFilter === "Completed"}
              />
            </div>

            {/* ── Completion Alert Strip ── */}
            {stats.completed > 0 && (
              <div
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                role="status"
              >
                <p className="text-sm text-emerald-900 flex items-center gap-2">
                  <span aria-hidden="true">🎉</span>
                  <span>
                    <strong className="font-semibold">{stats.completed} candidate{stats.completed === 1 ? "" : "s"}</strong>{" "}
                    completed induction and {stats.completed === 1 ? "is" : "are"} ready for role assignment.
                  </span>
                </p>
                <a
                  href="#candidates-table"
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Review →
                </a>
              </div>
            )}

            {/* ── Employee Categories Filter ── */}
            <section aria-labelledby="cat-heading" className="bg-white border border-slate-200 rounded-2xl mb-6">
              <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
                <div>
                  <h2 id="cat-heading" className="text-sm font-semibold text-slate-900">⊞ Employee Categories</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Click a category to filter the candidate list below.</p>
                </div>
                {categoryFilter && (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter(null)}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2"
                  >
                    ✕ Clear filter
                  </button>
                )}
              </header>
              <div className="flex flex-wrap gap-2 p-4">
                {CATEGORIES.map((cat) => {
                  const counts = countProfilesByTemplate(profilesForStats, cat.key);
                  const active = categoryFilter === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setCategoryFilter(active ? null : cat.key)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 text-xs transition ${
                        active
                          ? `${cat.borderClass} ${cat.bgClass} shadow-sm`
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`font-semibold ${active ? cat.textClass : "text-slate-900"}`}>{cat.label}</span>
                      <span className="text-slate-500">
                        {counts.total} total · <span className="font-semibold text-emerald-700">{counts.completed} done</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── Pending Induction Requests ── */}
            <section aria-labelledby="pending-heading" className="bg-white border border-slate-200 rounded-2xl mb-6">
              <header className="px-5 py-4 border-b border-slate-200">
                <h2 id="pending-heading" className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <span aria-hidden="true">📋</span> Pending Induction Requests
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-blue-600 text-white text-[11px] font-semibold px-1.5">
                    {requestsForCard.length}
                  </span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">Queued from HR dashboard. Review and accept to generate an induction link.</p>
              </header>
              {requestsForCard.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500 italic">No pending requests.</p>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {requestsForCard.map((req) => {
                    const isPending = requestActionPending.has(req.id);
                    const errorMsg = requestActionErrors.get(req.id);
                    return (
                      <li key={req.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center shrink-0" aria-hidden="true">
                          {initialsFromName(req.fullName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{req.fullName}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {req.departmentName ?? "—"} · {req.position ?? "—"} · requested {formatRelativeTime(req.triggeredAt)}
                          </p>
                          {errorMsg && (
                            <p className="text-xs text-red-700 mt-1 inline-flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" aria-hidden="true" />
                              {errorMsg}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleAcceptRequest(req.id)}
                            disabled={isPending}
                            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isPending ? "…" : "Accept"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeclineRequest(req.id)}
                            disabled={isPending}
                            className="inline-flex items-center rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isPending ? "…" : "Decline"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* ── Onboarding Candidates Table ── */}
            <section id="candidates-table" aria-labelledby="cand-heading" className="bg-white border border-slate-200 rounded-2xl mb-6">
              <header className="px-5 py-4 border-b border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="cand-heading" className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    Onboarding Candidates
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-semibold px-1.5">
                      {filteredProfiles.length}
                    </span>
                  </h2>
                  {hasCandidateFilters && (
                    <button
                      type="button"
                      onClick={clearCandidateFilters}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2"
                    >
                      ✕ Clear filters
                    </button>
                  )}
                </div>
                {/* A5 — filter bar mirroring the Employee Dashboard: search +
                    branch + role/type + status. Stacks with the Employee
                    Categories cards (both drive the same category filter). */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[220px]">
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name or email…"
                      className="w-full h-9 rounded-md border border-slate-300 bg-slate-50 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <label className="relative">
                    <span className="sr-only">Branch</span>
                    <select
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                      className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none cursor-pointer min-w-[140px]"
                    >
                      <option value="">All Branches</option>
                      {branchOptions.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </label>
                  <label className="relative">
                    <span className="sr-only">Role</span>
                    <select
                      value={categoryFilter ?? ""}
                      onChange={(e) => setCategoryFilter(e.target.value || null)}
                      className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none cursor-pointer min-w-[140px]"
                    >
                      <option value="">All Roles</option>
                      {CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="relative">
                    <span className="sr-only">Status</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none cursor-pointer min-w-[140px]"
                    >
                      <option value="">All Status</option>
                      <option value="Not Started">Pre-Onboarding</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Post-Onboarding</option>
                    </select>
                  </label>
                </div>
              </header>
              {filteredProfiles.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500 italic">
                  {profilesForStats.length === 0
                    ? "No active candidates in the pipeline yet."
                    : "No candidates match the current filter."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th scope="col" className="px-5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                        <th scope="col" className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                        <th scope="col" className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Branch</th>
                        <th scope="col" className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                        <th scope="col" className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Start</th>
                        <th scope="col" className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Progress</th>
                        <th scope="col" className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider sr-only">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredProfiles.map((p) => {
                        const pct = p.totalSteps > 0 ? Math.round((p.completedSteps / p.totalSteps) * 100) : 0;
                        const branchName = branchByUserId?.[p.userId] ?? "—";
                        const isCompleted = p.status === "Completed";
                        return (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center shrink-0" aria-hidden="true">
                                  {initialsFromName(p.employeeName)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900 truncate">{p.employeeName}</p>
                                  <p className="text-xs text-slate-500 truncate">{p.employeeEmail}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-700">{categoryLabelForTemplate(p.workflowTemplate)}</td>
                            <td className="px-3 py-3 text-xs font-mono text-slate-700">{branchName}</td>
                            <td className="px-3 py-3 text-xs text-slate-700">{departmentByUserId?.[p.userId] ?? "—"}</td>
                            <td className="px-3 py-3 text-xs text-slate-700 whitespace-nowrap">{formatDateShort(p.startDate)}</td>
                            <td className="px-3 py-3 min-w-[140px]">
                              <p className="text-[11px] text-slate-600 mb-1">{p.completedSteps}/{p.totalSteps} steps</p>
                              <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClasses(p.status)}`}>
                                {p.status}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right whitespace-nowrap">
                              {isCompleted ? (
                                <button
                                  type="button"
                                  onClick={() => setAssigningProfile(p)}
                                  className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                                >
                                  Assign Role →
                                </button>
                              ) : (
                                <Link
                                  href={`/induction/onboarding-dashboard/${p.id}`}
                                  className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-700"
                                  title="Open candidate detail view"
                                >
                                  View →
                                </Link>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* ── Assign Role Modal (Phase 2B+) ── */}
        {showHRLayout && assigningProfile && branches && activeUsers && (
          <AssignRoleModal
            profile={assigningProfile}
            branches={branches}
            departments={departments}
            activeUsers={activeUsers}
            onClose={() => setAssigningProfile(null)}
            onSuccess={() => {
              setAssigningProfile(null);
              router.refresh();
            }}
          />
        )}

        {/* ── Create Induction Profile Modal (Phase B) ── */}
        {showHRLayout && eligibleEmployees && (
          <CreateInductionProfileModal
            state={createModalState}
            onClose={() => setCreateModalState({ mode: "closed" })}
            employees={eligibleEmployees}
            onCreated={() => router.refresh()}
          />
        )}

        {/* The "Upcoming Hires" intake card is hidden in the new HR layout
            (showHRLayout) — the spec's Onboarding Candidates table replaces
            it. Card remains visible for ?type=offboarding and ?type=both
            views (showHRLayout = false there). */}
        <div className={`grid grid-cols-1 ${view === "both" ? "lg:grid-cols-2" : ""} gap-6 mb-8`}>
          {showOnboarding && !showHRLayout && (
          /* Onboarding card */
          <article className="bg-white border border-slate-200 rounded-2xl p-6">
            <header className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-start gap-3">
                <div className="bg-emerald-600 w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
                  <UserPlus className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Onboarding</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    ±1 week of start date
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-slate-900 tabular-nums leading-none">
                  {hires.length}
                </div>
                <div className="mt-1 text-xs">
                  <span className="font-semibold text-emerald-700">{hiresUrgent}</span>
                  <span className="text-slate-500"> within 1 week</span>
                </div>
              </div>
            </header>

            {hires.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500 italic">
                No upcoming hires.
              </p>
            ) : (
              <ul className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {hires.map((row) => {
                  const isEbright = row.source === "ebrightleads";
                  const isPending = pending.has(row.key);
                  const isQueued = row.hasPendingRequest;
                  const hasInduction = row.inductionProfileStatus !== null;
                  const errorMsg = errors.get(row.key);
                  const rowBg = row.isWithin7Days
                    ? "bg-rose-50 border-rose-200"
                    : "bg-slate-50 border-slate-200";
                  return (
                    <li
                      key={row.key}
                      className={`rounded-xl border ${rowBg} p-3 flex flex-wrap items-center gap-3`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-sm text-slate-900 truncate">{row.fullName}</p>
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                              row.isWithin7Days
                                ? "bg-rose-100 text-rose-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {dayLabel(row.daysUntilStart)}
                          </span>
                          {isEbright && (
                            <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                              ebrightleads
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {row.email ?? row.departmentName ?? "—"} · {row.position ?? "—"} · {row.departmentName ?? "—"}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">Starts {row.startDate}</p>
                        {errorMsg && (
                          <p className="text-xs text-red-700 mt-1 inline-flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" aria-hidden="true" />
                            {errorMsg}
                          </p>
                        )}
                      </div>
                      {hasInduction ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          {row.inductionProfileStatus === "Completed"
                            ? "Induction Completed"
                            : "In Induction"}
                        </span>
                      ) : isQueued ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Requested
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddToQueue(row)}
                          disabled={isPending}
                          title={isEbright ? "Promotes the ebrightleads candidate into HRFS and queues an induction." : undefined}
                          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                          {isPending ? "Adding…" : "Add to Induction Queue"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
          )}

          {showOffboarding && (
          /* Offboarding card */
          <article className="bg-white border border-slate-200 rounded-2xl p-6">
            <header className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-start gap-3">
                <div className="bg-rose-600 w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
                  <UserMinus className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Offboarding</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Leaving in the next 2 weeks
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-slate-900 tabular-nums leading-none">
                  {exits.length}
                </div>
                <div className="mt-1 text-xs">
                  <span className="font-semibold text-rose-700">{exitsUrgent}</span>
                  <span className="text-slate-500"> within 1 week</span>
                </div>
              </div>
            </header>

            {exits.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500 italic">
                No upcoming exits.
              </p>
            ) : (
              <ul className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {exits.map((row) => {
                  const isEbright = row.source === "ebrightleads";
                  const isPending = pending.has(row.key);
                  const isQueued = row.hasPendingRequest;
                  const hasInduction = row.inductionProfileStatus !== null;
                  const errorMsg = errors.get(row.key);
                  const rowBg = row.isWithin7Days
                    ? "bg-rose-50 border-rose-200"
                    : "bg-slate-50 border-slate-200";
                  return (
                    <li
                      key={row.key}
                      className={`rounded-xl border ${rowBg} p-3 flex flex-wrap items-center gap-3`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-sm text-slate-900 truncate">{row.fullName}</p>
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                              row.isWithin7Days
                                ? "bg-rose-100 text-rose-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {dayLabel(row.daysUntilEnd)}
                          </span>
                          {isEbright && (
                            <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                              ebrightleads
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {row.email ?? row.departmentName ?? "—"} · {row.position ?? "—"} · {row.departmentName ?? "—"}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">Leaves {row.endDate}</p>
                        {errorMsg && (
                          <p className="text-xs text-red-700 mt-1 inline-flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" aria-hidden="true" />
                            {errorMsg}
                          </p>
                        )}
                      </div>
                      {hasInduction ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          {row.inductionProfileStatus === "Completed"
                            ? "Induction Completed"
                            : "In Induction"}
                        </span>
                      ) : isQueued ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Requested
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddToQueue(row)}
                          disabled={isPending}
                          title={isEbright ? "Promotes the ebrightleads candidate into HRFS and queues an induction." : undefined}
                          className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <UserMinus className="w-3.5 h-3.5" aria-hidden="true" />
                          {isPending ? "Adding…" : "Add to Induction Queue"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
          )}
        </div>

        {/* The workflow-preview swimlane (template tabs + dept dropdown +
            step cards) is hidden in the HR onboarding view per spec.
            Still rendered for ?type=offboarding and ?type=both views. */}
        <div className="space-y-6">
          {showOnboarding && !showHRLayout && (
            <InteractiveWorkflowSection
              kind="Onboarding"
              templateSteps={WORKFLOW_TEMPLATES.Standard}
              ownInduction={ownInduction}
              isManager={isManager}
              substepTemplates={substepTemplates}
              departments={departments}
            />
          )}
          {showOffboarding && (
            <InteractiveWorkflowSection
              kind="Offboarding"
              templateSteps={OFFBOARDING_WORKFLOW}
              ownInduction={ownInduction}
              isManager={isManager}
              substepTemplates={substepTemplates}
              departments={departments}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface InteractiveWorkflowSectionProps {
  kind: "Onboarding" | "Offboarding";
  templateSteps: readonly WorkflowStepTemplate[];
  ownInduction: InductionView | null;
  isManager: boolean;
  substepTemplates: SubstepTemplateView[];
  departments: DepartmentOption[];
}

function InteractiveWorkflowSection({
  kind,
  templateSteps,
  ownInduction,
  isManager,
  substepTemplates,
  departments,
}: InteractiveWorkflowSectionProps) {
  const ownInductionMatchesKind =
    ownInduction !== null && ownInduction.inductionType === kind;
  const showInteractiveChecklist = ownInductionMatchesKind;

  // Manager-side workflow switcher state. Only used when previewing reference
  // workflows (i.e. the viewer doesn't have an active induction of this kind).
  // Default is "Standard" = Intern · HQ.
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("Standard");

  // Department selector for the Department Training sub-workflow. Defaults
  // to the first department in the list so managers see something on load
  // without having to pick one first.
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(
    departments[0]?.id ?? null,
  );

  // Active template for substep lookup — own induction uses its real template,
  // manager preview uses whichever template the switcher has selected.
  const activeTemplateKey = ownInductionMatchesKind && ownInduction
    ? ownInduction.workflowTemplate
    : selectedTemplateKey;

  // Inductee viewing their own induction → use their employment department.
  // Manager previewing → use the dropdown selection.
  const activeDepartmentId = ownInductionMatchesKind && ownInduction
    ? ownInduction.departmentId
    : selectedDepartmentId;

  const substepsByParent = groupSubstepsByParent(
    substepTemplates,
    activeTemplateKey,
    activeDepartmentId,
  );

  const subtitle = ownInductionMatchesKind
    ? `Tracking your ${kind.toLowerCase()} progress.`
    : `Reference workflow for ${kind === "Onboarding" ? "new hires" : "exits"}.`;

  if (kind === "Onboarding") {
    // For manager preview, pick the steps from the currently-selected template
    // in the switcher. For the inductee's own view, use their real steps.
    const previewTemplate =
      WORKFLOW_TEMPLATES[selectedTemplateKey] ?? WORKFLOW_TEMPLATES.Standard;
    const stepsToRender: InductionStepView[] = ownInductionMatchesKind
      ? ownInduction.steps
      : templateToPreviewSteps(previewTemplate);

    const startDate = ownInductionMatchesKind && ownInduction
      ? ownInduction.startDate
      : PREVIEW_START_DATE;
    const activeTemplateMeta =
      EMPLOYEE_TYPE_TEMPLATES.find((t) => t.key === selectedTemplateKey) ??
      EMPLOYEE_TYPE_TEMPLATES[0];
    const swimlaneSubtitle = showInteractiveChecklist
      ? "Tracking your onboarding progress — click a task to mark it done."
      : `Reference workflow for ${activeTemplateMeta.short} · ${activeTemplateMeta.location}. ${
          isManager
            ? "Switch tabs to see the workflow for each employee type."
            : ""
        }`;
    const swimlaneTitle = showInteractiveChecklist
      ? "Onboarding workflow"
      : `Onboarding workflow — ${activeTemplateMeta.short}`;

    return (
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* Template + department switcher — only shown in manager / preview mode */}
        {!showInteractiveChecklist && (
          <div className="space-y-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                View workflow by employee type
              </p>
              <div className="flex flex-wrap gap-2">
                {EMPLOYEE_TYPE_TEMPLATES.map((t) => {
                  const isActive = selectedTemplateKey === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setSelectedTemplateKey(t.key)}
                      className={
                        isActive
                          ? `inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${t.accent} px-3 py-1.5 text-xs font-bold text-white shadow ring-2 ring-white`
                          : "inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                      }
                      title={workflowTemplateLabel(t.key)}
                    >
                      <span>{t.short}</span>
                      <span className={isActive ? "text-white/80" : "text-slate-400"}>
                        · {t.location}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {departments.length > 0 && (
              <div>
                <label
                  htmlFor="dept-switcher"
                  className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  🏢 Department Training is for…
                </label>
                <select
                  id="dept-switcher"
                  value={selectedDepartmentId ?? ""}
                  onChange={(e) =>
                    setSelectedDepartmentId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-full max-w-xs rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-slate-500">
                  Inductees in this department will auto-load this sub-workflow when they
                  reach the Department Training step.
                </p>
              </div>
            )}
          </div>
        )}
        <OnboardingWorkflow
          steps={stepsToRender}
          startDate={startDate}
          token={showInteractiveChecklist && ownInduction ? ownInduction.linkToken : undefined}
          canMarkComplete={showInteractiveChecklist}
          title={swimlaneTitle}
          subtitle={swimlaneSubtitle}
          // Manager preview — phase locking only applies on the per-employee
          // induction link, not on the reference workflow shown here.
          enforceLocking={false}
          substepsByParent={substepsByParent}
          templateKey={activeTemplateKey}
          canManageSubsteps={isManager && !showInteractiveChecklist}
          currentDepartmentId={activeDepartmentId}
          departments={departments}
        />
      </article>
    );
  }

  // Offboarding fallback uses the legacy WorkflowDiagram path — single template,
  // no switcher needed.
  const stepsToRender: InductionStepView[] = ownInductionMatchesKind
    ? ownInduction.steps
    : templateToPreviewSteps(templateSteps);

  return (
    <article className="bg-white border border-slate-200 rounded-2xl p-6">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{kind} workflow</h2>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <WorkflowDiagram steps={stepsToRender} />
        </div>
        <div>
          {showInteractiveChecklist && ownInduction ? (
            <TrainingChecklist
              steps={ownInduction.steps}
              token={ownInduction.linkToken}
              canMarkComplete
            />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">
                Read-only reference
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {isManager
                  ? `This is the reference ${kind.toLowerCase()} workflow. To mark steps complete, open a specific employee's induction link from the Control Centre.`
                  : `This is the reference ${kind.toLowerCase()} workflow. ${
                      ownInduction && !ownInductionMatchesKind
                        ? "Your active induction is a different type."
                        : "You don't have an active induction profile of this type."
                    }`}
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** Phase 2B stat card with a colored top accent bar. */
function StatCard({
  label,
  value,
  subtitle,
  accentClass,
  onClick,
  isActive = false,
}: {
  label: string;
  value: number;
  subtitle: string;
  accentClass: string;
  onClick?: () => void;
  isActive?: boolean;
}) {
  const body = (
    <>
      <div className={`absolute top-0 left-0 right-0 h-1 ${accentClass}`} aria-hidden="true" />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums leading-none">{value}</p>
      <p className="mt-1.5 text-[11px] text-slate-500">{subtitle}</p>
    </>
  );
  const base = "relative bg-white border rounded-2xl p-4 overflow-hidden transition";
  if (typeof onClick === "function") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isActive}
        className={`${base} w-full text-left cursor-pointer hover:border-slate-300 hover:shadow-md ${
          isActive ? "border-slate-400 shadow-md ring-2 ring-slate-200" : "border-slate-200"
        }`}
      >
        {body}
      </button>
    );
  }
  return <div className={`${base} border-slate-200`}>{body}</div>;
}
