"use client";

import { useState, useTransition } from "react";
import { createInduction } from "@/app/induction/actions";
import type { InductionEmployeeOption } from "@/app/induction/queries";
import { CredentialScreen, type CredentialData } from "./CredentialScreen";

/**
 * Create Induction Profile modal — per spec v2 Phase B.
 *
 * Two screens inside one modal:
 *   Step 1: Form (employee, type toggle, template, start date, buddy)
 *   Step 2: Credential screen (username, temp password, login link, copy)
 *
 * Trigger sources:
 *   - "+ New Candidate" button on OnboardingDashboard → opens in "form" mode
 *   - Accept on a pending request → can open in "credential" mode if the
 *     parent already called acceptInductionRequest and got back the data
 *
 * // TODO: Spec wants free-text Name + Email fields so HR can create a
 * //       candidate WITHOUT them already being an employee. Current
 * //       createInduction server action requires user_id. Until a "create
 * //       user from scratch" path is added, the email field here is
 * //       validated against existing employees.
 *
 * // TODO: Real email sending — spec's "email queued automatically" is
 * //       stubbed to console.log only. Wire to Resend/nodemailer in Phase F.
 */

export type ModalState =
  | { mode: "closed" }
  | { mode: "form"; prefill?: { employeeName?: string; employeeEmail?: string } }
  | { mode: "credential"; data: CredentialData };

interface Props {
  state: ModalState;
  onClose: () => void;
  /** Eligible employees for the email lookup (existing users only for now). */
  employees: InductionEmployeeOption[];
  /** Optional callback after successful create (for parent router.refresh). */
  onCreated?: () => void;
}

const WORKFLOW_TEMPLATES: Array<{ value: string; label: string }> = [
  { value: "Standard", label: "Regular Intern · HQ" },
  { value: "ProtegeInternBranch", label: "Protege Intern · Branch" },
  { value: "CoachPartTimer", label: "Coach (Part-timer) · Branch + 3-week training" },
  { value: "CoachFullTimer", label: "Coach (Full-timer) · Branch + 3-week training" },
  { value: "FullTimer", label: "Full-timer · HQ or Branch" },
];

function generateUsername(email: string): string {
  return email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

function generateTempPassword(): string {
  return "eBright@" + String(Math.floor(1000 + Math.random() * 9000));
}

export function CreateInductionProfileModal({
  state,
  onClose,
  employees,
  onCreated,
}: Props) {
  if (state.mode === "closed") return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-induction-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {state.mode === "form" ? (
          <FormView
            prefillName={state.prefill?.employeeName}
            prefillEmail={state.prefill?.employeeEmail}
            employees={employees}
            onClose={onClose}
            onCreated={onCreated}
          />
        ) : (
          <CredentialScreen data={state.data} onDone={onClose} />
        )}
      </div>
    </div>
  );
}

// ─── FORM VIEW ───
function FormView({
  prefillName,
  prefillEmail,
  employees,
  onClose,
  onCreated,
}: {
  prefillName?: string;
  prefillEmail?: string;
  employees: InductionEmployeeOption[];
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [employeeName, setEmployeeName] = useState(prefillName ?? "");
  const [employeeEmail, setEmployeeEmail] = useState(prefillEmail ?? "");
  const [inductionType, setInductionType] = useState<"Onboarding" | "Offboarding">("Onboarding");
  const [workflowTemplate, setWorkflowTemplate] = useState("Standard");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [buddyUserId, setBuddyUserId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<CredentialData | null>(null);
  const [submitting, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!employeeName.trim() || !employeeEmail.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    // Look up existing employee by email
    const match = employees.find(
      (emp) => emp.email.toLowerCase() === employeeEmail.trim().toLowerCase(),
    );
    if (!match) {
      setError(
        "Email doesn't match an existing employee. Create-from-scratch is coming in a future PR — for now the email must match a registered employee account.",
      );
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("user_id", String(match.userId));
      fd.set("induction_type", inductionType);
      fd.set("workflow_template", workflowTemplate);
      fd.set("start_date", startDate);
      if (buddyUserId) fd.set("buddy_user_id", buddyUserId);

      const result = await createInduction(null, fd);
      if (!result.ok) {
        setError(result.error ?? "Could not create induction profile.");
        return;
      }

      // Build the credential screen data
      const username = generateUsername(employeeEmail);
      const tempPassword = generateTempPassword();
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const loginLink = `${baseUrl}/induction/${result.token ?? ""}`;

      // TODO: wire up real email send (Resend). Credentials are shown
      // on-screen via the credential screen only — never logged.

      setCredentials({
        candidateName: employeeName.trim(),
        candidateEmail: employeeEmail.trim(),
        username,
        tempPassword,
        loginLink,
      });
      onCreated?.();
    });
  };

  // Once credentials are set, replace form with credential screen
  if (credentials) {
    return <CredentialScreen data={credentials} onDone={onClose} />;
  }

  return (
    <>
      <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
        <div>
          <h2 id="create-induction-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
            Create Induction Profile
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Generates an induction link the candidate can use to start their journey.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none px-2"
        >
          ×
        </button>
      </header>

      <form onSubmit={submit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
        <Field label="Employee Name" required>
          <input
            type="text"
            value={employeeName}
            onChange={(e) => setEmployeeName(e.target.value)}
            required
            placeholder="Full name"
            className="w-full rounded-md border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>

        <Field label="Email Address" required>
          <input
            type="email"
            value={employeeEmail}
            onChange={(e) => setEmployeeEmail(e.target.value)}
            required
            placeholder="name@ebright.my"
            className="w-full rounded-md border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Must match an existing employee account.
          </p>
        </Field>

        <Field label="Induction Type">
          <div className="flex border border-slate-300 dark:border-slate-600 rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setInductionType("Onboarding")}
              className={`flex-1 py-2 text-sm font-semibold transition ${
                inductionType === "Onboarding"
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              Onboarding (New Hire)
            </button>
            <button
              type="button"
              onClick={() => setInductionType("Offboarding")}
              className={`flex-1 py-2 text-sm font-semibold transition ${
                inductionType === "Offboarding"
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              Offboarding (Exiting)
            </button>
          </div>
        </Field>

        <Field label="Workflow Template" required>
          <select
            value={workflowTemplate}
            onChange={(e) => setWorkflowTemplate(e.target.value)}
            required
            className="w-full rounded-md border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {WORKFLOW_TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Start Date" required>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="w-full rounded-md border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>

        <Field label="Induction Buddy">
          <select
            value={buddyUserId}
            onChange={(e) => setBuddyUserId(e.target.value)}
            className="w-full rounded-md border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">No buddy assigned</option>
            {employees
              .filter((e) => e.email.toLowerCase() !== employeeEmail.trim().toLowerCase())
              .map((emp) => (
                <option key={emp.userId} value={emp.userId}>
                  {emp.fullName} ({emp.email})
                </option>
              ))}
          </select>
        </Field>

        {error && (
          <div
            className="rounded-md border border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-900 px-3 py-2 text-xs text-rose-800 dark:text-rose-200"
            role="alert"
          >
            {error}
          </div>
        )}
      </form>

      <footer className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-800">
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
          onClick={submit}
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? "Creating…" : "Create & Generate Link"}
        </button>
      </footer>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
        {label} {required && <span className="text-red-600 dark:text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}
