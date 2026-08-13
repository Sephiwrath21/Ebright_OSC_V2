"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { CreateWorkflowModal } from "./CreateWorkflowModal";
import type { WorkflowListRow } from "@/lib/workflow/queries";

interface DepartmentOption {
  id: number;
  name: string;
  code: string;
}

interface Props {
  workflows: WorkflowListRow[];
  departments: DepartmentOption[];
  canCreateNew: boolean;
  canEditAny: boolean;
  /** True for superadmin / admin / hr / od — they see the "All" tab + every dept tab. */
  showAllTabs: boolean;
  /** Set when actor is HOD — locks department in the create modal. */
  lockedDepartmentId: number | null;
  knownCategories: string[];
}

const STATUS_PILL: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700",
  draft: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600",
  archived: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900 dark:text-rose-200 dark:border-rose-700",
};

const CATEGORY_PILL: Record<string, string> = {
  Onboarding: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700",
  Offboarding: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900 dark:text-rose-200 dark:border-rose-700",
  Other: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600",
};

export function WorkflowCenterView({
  workflows,
  departments,
  canCreateNew,
  canEditAny,
  showAllTabs,
  lockedDepartmentId,
  knownCategories,
}: Props) {
  // "All" only available if showAllTabs is true. Otherwise default to the
  // first (and probably only) department the actor can see.
  const initialTab: number | "All" = showAllTabs ? "All" : departments[0]?.id ?? "All";
  const [activeTab, setActiveTab] = useState<number | "All">(initialTab);
  const [createOpen, setCreateOpen] = useState(false);

  // Success banner after a workflow delete redirect (?deleted=1).
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showDeleted, setShowDeleted] = useState(searchParams.get("deleted") === "1");
  const dismissDeleted = () => {
    setShowDeleted(false);
    router.replace("/dashboards/workflow-center");
  };

  const filtered =
    activeTab === "All"
      ? workflows
      : workflows.filter((w) => w.departmentId === activeTab);

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 dark:hover:text-slate-100">HRMS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Workflow Center</span>
        </nav>

        {showDeleted && (
          <div
            role="status"
            className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900 px-4 py-3"
          >
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-200">
              <span aria-hidden="true">✓</span>
              Workflow deleted successfully
            </p>
            <button
              type="button"
              onClick={dismissDeleted}
              aria-label="Dismiss"
              className="px-1 text-lg leading-none text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100"
            >
              ×
            </button>
          </div>
        )}

        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              Workflow Center
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {showAllTabs
                ? "Department onboarding workflows — all departments"
                : "Your department's onboarding workflows"}
            </p>
          </div>
          {canCreateNew && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              ＋ New Workflow
            </button>
          )}
        </header>

        {/* Department tabs */}
        <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-0">
          {showAllTabs && (
            <TabButton label="All" active={activeTab === "All"} onClick={() => setActiveTab("All")} count={workflows.length} />
          )}
          {departments.map((d) => (
            <TabButton
              key={d.id}
              label={d.name}
              active={activeTab === d.id}
              onClick={() => setActiveTab(d.id)}
              count={workflows.filter((w) => w.departmentId === d.id).length}
            />
          ))}
        </div>

        {/* List card */}
        <section aria-labelledby="workflows-heading" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 id="workflows-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {activeTab === "All" ? "All workflows" : "Department workflows"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {filtered.length} workflow{filtered.length === 1 ? "" : "s"}
            </p>
          </header>

          {filtered.length === 0 ? (
            <EmptyState canCreateNew={canCreateNew} onCreate={() => setCreateOpen(true)} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-5 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Workflow Name</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Department</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Applies To</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Steps</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Assigned</th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filtered.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-5 py-3">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{w.name}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300">{w.departmentName}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_PILL[w.category] ?? "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900 dark:text-violet-200 dark:border-violet-700"}`}>
                          {w.category}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300">
                        {w.appliesTo.length === 0 ? "—" : w.appliesTo.join(", ")}
                      </td>
                      <td className="px-3 py-3 text-center text-sm text-slate-700 dark:text-slate-300 tabular-nums">{w.stepCount}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${STATUS_PILL[w.status]}`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-sm text-slate-700 dark:text-slate-300 tabular-nums">{w.assignedCount}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/dashboards/workflow-center/${w.id}`}
                            className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            View →
                          </Link>
                          {canEditAny && (
                            <Link
                              href={`/dashboards/workflow-center/${w.id}?edit=1`}
                              className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                            >
                              Edit
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <CreateWorkflowModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        departments={departments}
        lockedDepartmentId={lockedDepartmentId}
        knownCategories={knownCategories}
      />
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-xs font-semibold rounded-t-md transition flex items-center gap-2 ${
        active
          ? "bg-white text-blue-700 border border-slate-200 border-b-white -mb-px dark:bg-slate-900 dark:text-blue-400 dark:border-slate-800 dark:border-b-slate-900"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      <span>{label}</span>
      <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
        active ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
      }`}>
        {count}
      </span>
    </button>
  );
}

function EmptyState({
  canCreateNew,
  onCreate,
}: {
  canCreateNew: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-3xl mb-2" aria-hidden="true">📋</p>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No workflows yet</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {canCreateNew
          ? "Click ＋ New Workflow above to create the first one."
          : "Once HOD creates and publishes workflows, they'll appear here."}
      </p>
      {canCreateNew && (
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          ＋ New Workflow
        </button>
      )}
    </div>
  );
}
