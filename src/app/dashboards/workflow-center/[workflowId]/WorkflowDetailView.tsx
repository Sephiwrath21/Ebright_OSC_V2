"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Home, ArrowLeft } from "lucide-react";
import type { WorkflowDetail } from "@/lib/workflow/queries";
import {
  publishWorkflow,
  archiveWorkflow,
  updateWorkflow,
  addWorkflowStep,
  deleteWorkflowStep,
  deleteWorkflow,
} from "../actions";

interface Props {
  workflow: WorkflowDetail;
  /** When true, fields are editable + actions are enabled. */
  canEdit: boolean;
  /** When true (superadmin/admin), the Delete button is shown. */
  canDelete: boolean;
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

const ACTOR_BADGE: Record<string, string> = {
  Candidate: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700",
  HOD: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:border-purple-700",
  HR: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700",
  Buddy: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700",
  System: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600",
};

const TYPE_BADGE: Record<string, string> = {
  Task: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  Submission: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  Meeting: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
  "Sign-off": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
  Reading: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200",
};

const ACTOR_OPTIONS = ["Candidate", "HOD", "HR", "Buddy", "System"];
const TYPE_OPTIONS = ["Task", "Submission", "Meeting", "Sign-off", "Reading"];
const TRIGGER_OPTIONS = [
  { value: "after-day-3", label: "After Day 3 Induction Completed" },
  { value: "after-branch", label: "After Branch Onboarding Completed" },
  { value: "manual", label: "Manual assignment by HR" },
];
const DEFAULT_CATEGORIES = ["Onboarding", "Offboarding", "Other"];

export function WorkflowDetailView({ workflow, canEdit, canDelete }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  // Local edit state — only used when canEdit is true.
  const [editName, setEditName] = useState(workflow.name);
  const [editCategory, setEditCategory] = useState(workflow.category);
  const [editTrigger, setEditTrigger] = useState(workflow.trigger);

  const knownCategories = Array.from(
    new Set([...DEFAULT_CATEGORIES, workflow.category]),
  );

  const handleSaveDraft = () => {
    setError(null);
    const fd = new FormData();
    fd.set("name", editName);
    fd.set("category", editCategory);
    fd.set("trigger", editTrigger);
    startTransition(async () => {
      const result = await updateWorkflow(workflow.id, fd);
      if (!result.ok) setError(result.error ?? "Could not save.");
      else router.refresh();
    });
  };

  const handlePublish = () => {
    setError(null);
    startTransition(async () => {
      // Save edits first if name/category/trigger changed
      if (
        editName !== workflow.name ||
        editCategory !== workflow.category ||
        editTrigger !== workflow.trigger
      ) {
        const fd = new FormData();
        fd.set("name", editName);
        fd.set("category", editCategory);
        fd.set("trigger", editTrigger);
        const r1 = await updateWorkflow(workflow.id, fd);
        if (!r1.ok) {
          setError(r1.error ?? "Could not save.");
          return;
        }
      }
      const r2 = await publishWorkflow(workflow.id);
      if (!r2.ok) setError(r2.error ?? "Could not publish.");
      else router.refresh();
    });
  };

  const handleArchive = () => {
    setError(null);
    if (!confirm("Archive this workflow? It will stop being assignable.")) return;
    startTransition(async () => {
      const result = await archiveWorkflow(workflow.id);
      if (!result.ok) setError(result.error ?? "Could not archive.");
      else router.refresh();
    });
  };

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteWorkflow(workflow.id);
      if (!result.ok) {
        setError(result.error ?? "Could not delete.");
        setShowDelete(false);
      } else {
        // Success → list page shows the "deleted" banner.
        router.push("/dashboards/workflow-center?deleted=1");
      }
    });
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto px-6 pt-4 pb-10">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-4">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/workflow-center" className="hover:text-slate-900 dark:hover:text-slate-100">Workflow Center</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium truncate">{workflow.name}</span>
        </nav>

        {/* Back + actions row */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/dashboards/workflow-center"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Workflow Center
          </Link>
          {(canEdit || canDelete) && (
            <div className="flex items-center gap-2">
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={pending}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-60"
                  >
                    {pending ? "Saving…" : "Save Draft"}
                  </button>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={pending}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {pending ? "Publishing…" : workflow.status === "active" ? "Re-publish" : "Publish"}
                  </button>
                  {workflow.status !== "archived" && (
                    <button
                      type="button"
                      onClick={handleArchive}
                      disabled={pending}
                      className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-900 dark:hover:text-rose-200 disabled:opacity-60"
                    >
                      Archive
                    </button>
                  )}
                </>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setShowDelete(true)}
                  disabled={pending}
                  className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-700 dark:bg-rose-900 dark:text-rose-200">
            {error}
          </div>
        )}

        {showDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <button
              type="button"
              aria-label="Close"
              onClick={() => !pending && setShowDelete(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm focus:outline-none"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-workflow-title"
              className="relative w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:ring-1 dark:ring-white/10"
            >
              <div className="p-6">
                <h2 id="delete-workflow-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Delete workflow?
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Are you sure you want to delete this workflow? This action cannot be undone.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDelete(false)}
                  disabled={pending}
                  className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  className="h-9 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {pending ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header card */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5">
          {canEdit ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full text-xl font-semibold text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-500 dark:bg-slate-950 rounded-md px-2 py-1.5 focus:border-blue-500 focus:outline-none"
            />
          ) : (
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{workflow.name}</h1>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
              {workflow.departmentName}
            </span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_PILL[workflow.category] ?? "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900 dark:text-violet-200 dark:border-violet-700"}`}>
              {workflow.category}
            </span>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${STATUS_PILL[workflow.status]}`}>
              {workflow.status}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {workflow.assignedCount} candidate{workflow.assignedCount === 1 ? "" : "s"} assigned
            </span>
          </div>
        </section>

        {/* Category + Trigger */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Category</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Drives auto-assignment behavior</p>
            {canEdit ? (
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="w-full text-sm rounded-md border border-slate-300 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100 px-3 py-2 focus:border-blue-500 focus:outline-none"
              >
                {knownCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{workflow.category}</p>
            )}
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Trigger</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">When this workflow starts</p>
            {canEdit ? (
              <select
                value={editTrigger}
                onChange={(e) => setEditTrigger(e.target.value)}
                className="w-full text-sm rounded-md border border-slate-300 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100 px-3 py-2 focus:border-blue-500 focus:outline-none"
              >
                {TRIGGER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {TRIGGER_OPTIONS.find((t) => t.value === workflow.trigger)?.label ?? workflow.trigger}
              </p>
            )}
          </div>
        </section>

        {/* Applies To */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Linked Employee Types</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Which employee types this workflow applies to (edit via the list above on the
            list page — full multi-select editing in a later phase).
          </p>
          {workflow.appliesTo.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic">None set yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {workflow.appliesTo.map((t) => (
                <span key={t} className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 text-xs font-semibold dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700">
                  {t}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Step list */}
        <section aria-labelledby="steps-heading" className="bg-white border border-slate-200 rounded-2xl mb-5">
          <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h2 id="steps-heading" className="text-sm font-semibold text-slate-900">Workflow Steps</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {workflow.steps.length} step{workflow.steps.length === 1 ? "" : "s"}
              </p>
            </div>
          </header>
          {workflow.steps.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500 italic">
              No steps yet. {canEdit ? "Add the first one below." : ""}
            </p>
          ) : (
            <ol className="divide-y divide-slate-200">
              {workflow.steps.map((step) => (
                <li key={step.id} className="px-5 py-4">
                  <div className="flex items-start gap-4">
                    <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0" aria-hidden="true">
                      {step.stepNumber}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
                        <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${ACTOR_BADGE[step.actorRole] ?? ACTOR_BADGE.System}`}>
                          {step.actorRole}
                        </span>
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[step.type] ?? TYPE_BADGE.Task}`}>
                          {step.type}
                        </span>
                        {step.required && (
                          <span className="inline-flex items-center rounded bg-rose-50 text-rose-700 px-2 py-0.5 text-[10px] font-semibold border border-rose-200">
                            Required
                          </span>
                        )}
                      </div>
                      {step.description && (
                        <p className="mt-1 text-xs text-slate-600 leading-relaxed">{step.description}</p>
                      )}
                      <p className="mt-1.5 text-[11px] text-slate-500">
                        Due {step.dueDaysAfterStart === 0
                          ? "on day of workflow start"
                          : `${step.dueDaysAfterStart} day${step.dueDaysAfterStart === 1 ? "" : "s"} after start`}
                      </p>
                    </div>
                    {canEdit && (
                      <DeleteStepButton stepId={step.id} disabled={pending} />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {canEdit && <AddStepForm workflowId={workflow.id} />}
        </section>

        {/* Bookkeeping */}
        <p className="text-[11px] text-slate-400 italic">
          Created by {workflow.createdByName} on {new Date(workflow.createdAt).toLocaleString()}.
          {workflow.publishedAt && ` Published ${new Date(workflow.publishedAt).toLocaleString()}.`}
          {workflow.archivedAt && ` Archived ${new Date(workflow.archivedAt).toLocaleString()}.`}
        </p>
      </div>
    </div>
  );
}

// ─── Add Step Form ────────────────────────────────────────────────
function AddStepForm({ workflowId }: { workflowId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [actor, setActor] = useState("Candidate");
  const [type, setType] = useState("Task");
  const [description, setDescription] = useState("");
  const [dueDays, setDueDays] = useState(0);
  const [required, setRequired] = useState(true);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    const fd = new FormData();
    fd.set("title", title.trim());
    fd.set("actor_role", actor);
    fd.set("type", type);
    fd.set("description", description);
    fd.set("due_days_after_start", String(dueDays));
    fd.set("required", required ? "on" : "off");

    startTransition(async () => {
      const result = await addWorkflowStep(workflowId, fd);
      if (!result.ok) {
        setError(result.error ?? "Could not add step.");
        return;
      }
      setTitle("");
      setDescription("");
      setDueDays(0);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="border-t border-slate-200 px-5 py-4 space-y-3 bg-slate-50">
      <h3 className="text-xs font-semibold text-slate-700">Add Step</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Step title"
          required
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
        />
        <select
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
        >
          {ACTOR_OPTIONS.map((a) => (
            <option key={a} value={a}>Actor: {a}</option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>Type: {t}</option>
          ))}
        </select>
        <input
          type="number"
          value={dueDays}
          onChange={(e) => setDueDays(Number(e.target.value))}
          min={0}
          placeholder="Due days after start"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Required step
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Adding…" : "＋ Add Step"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-rose-700">{error}</p>
      )}
    </form>
  );
}

// ─── Delete Step Button ───────────────────────────────────────────
function DeleteStepButton({ stepId, disabled }: { stepId: number; disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const handle = () => {
    if (!confirm("Delete this step? Remaining steps will be renumbered.")) return;
    startTransition(async () => {
      const result = await deleteWorkflowStep(stepId);
      if (!result.ok) {
        alert(result.error ?? "Could not delete.");
        return;
      }
      router.refresh();
    });
  };
  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled || pending}
      className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-40"
    >
      {pending ? "…" : "Delete"}
    </button>
  );
}
