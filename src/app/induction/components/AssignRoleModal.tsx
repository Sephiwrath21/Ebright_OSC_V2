"use client";

import { useState, useTransition } from "react";
import { assignCandidateRole } from "@/app/induction/actions";
import type { PendingInductionRow, DepartmentOption } from "@/app/induction/queries";
import type { BranchOpt } from "@/lib/employeeQueries";

export interface ActiveUserOption {
  userId: number;
  fullName: string;
  email: string;
  position: string | null;
}

interface Props {
  profile: PendingInductionRow;
  branches: BranchOpt[];
  departments: DepartmentOption[];
  activeUsers: ActiveUserOption[];
  onClose: () => void;
  onSuccess: () => void;
}

const ROLE_OPTIONS = [
  "Regular Intern",
  "Protege Intern",
  "Part-time Coach",
  "Full-time Coach",
  "Executive HQ",
  "Manager",
] as const;

export function AssignRoleModal({
  profile,
  branches,
  departments,
  activeUsers,
  onClose,
  onSuccess,
}: Props) {
  const [role, setRole] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");
  const [reportsToUserId, setReportsToUserId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();

  const canSubmit = role !== "" && departmentId !== "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await assignCandidateRole({
        profileId: profile.id,
        role,
        departmentId: Number(departmentId),
        branchId: branchId ? Number(branchId) : null,
        reportsToUserId: reportsToUserId ? Number(reportsToUserId) : null,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to assign role.");
      } else {
        onSuccess();
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-role-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(17, 17, 17, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 id="assign-role-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
            Assign Permanent Role
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            For <span className="font-semibold text-slate-700 dark:text-slate-300">{profile.employeeName}</span> ({profile.employeeEmail})
          </p>
        </header>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <Field label="Permanent Role" required>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
              className="w-full rounded-md border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a role…</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>

          <Field label="Department" required>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              required
              className="w-full rounded-md border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a department…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Assigned Branch">
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— No branch (HQ-based) —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code ? `${b.code} · ${b.name}` : b.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Reporting To">
            <select
              value={reportsToUserId}
              onChange={(e) => setReportsToUserId(e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— No direct manager —</option>
              {activeUsers.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.fullName}{u.position ? ` · ${u.position}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <div
            className="rounded-md border px-3 py-2.5 text-xs flex items-start gap-2"
            style={{ background: "var(--tint-amber)", borderColor: "#FED7AA", color: "var(--accent-amber-strong)" }}
          >
            <span aria-hidden="true">⚠️</span>
            <span>
              Confirming will remove this candidate from the onboarding pipeline and update their
              employment record with the new role.
            </span>
          </div>

          {error && (
            <div
              className="rounded-md border px-3 py-2 text-xs"
              style={{ background: "var(--tint-red)", borderColor: "var(--tint-red-strong)", color: "var(--accent-red-strong)" }}
            >
              {error}
            </div>
          )}
        </form>

        <footer
          className="px-6 py-4 flex items-center justify-end gap-2"
          style={{ background: "var(--surface-subtle)", borderTop: "1px solid var(--border-subtle)" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="rounded-md px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "#16A34A" }}
          >
            {submitting ? "Assigning…" : "Confirm & Assign Role"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
        {label} {required && <span className="text-red-600 dark:text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}
