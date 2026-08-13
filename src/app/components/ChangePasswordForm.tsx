"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, KeyRound, CircleAlert } from "lucide-react";
import { changePassword, type ChangePasswordResult } from "@/app/profile/actions";

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ChangePasswordResult | null, FormData>(changePassword, null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <form action={formAction} className="p-6 space-y-5" autoComplete="off">
      {state?.error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-md border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900 text-sm text-red-800 dark:text-red-200">
          <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      )}

      <PasswordField
        label="Current Password"
        name="currentPassword"
        show={showCurrent}
        onToggle={() => setShowCurrent((v) => !v)}
        autoComplete="current-password"
      />
      <PasswordField
        label="New Password"
        name="newPassword"
        show={showNew}
        onToggle={() => setShowNew((v) => !v)}
        autoComplete="new-password"
        minLength={8}
        hint="At least 8 characters."
      />
      <PasswordField
        label="Confirm New Password"
        name="confirmPassword"
        show={showConfirm}
        onToggle={() => setShowConfirm((v) => !v)}
        autoComplete="new-password"
        minLength={8}
      />

      <div className="flex items-center justify-end gap-2 pt-2">
        <Link
          href="/profile"
          className="h-10 inline-flex items-center px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="h-10 inline-flex items-center gap-2 px-5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <KeyRound className="w-4 h-4" aria-hidden="true" />
          {pending ? "Updating..." : "Update Password"}
        </button>
      </div>
    </form>
  );
}

function PasswordField({
  label,
  name,
  show,
  onToggle,
  autoComplete,
  minLength,
  hint,
}: {
  label: string;
  name: string;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  minLength?: number;
  hint?: string;
}) {
  const id = `pwd-${name}`;
  return (
    <label htmlFor={id} className="block">
      <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
        {label}
        <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
      </span>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          className="block w-full h-10 pl-3 pr-10 rounded-lg border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {show ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
        </button>
      </div>
      {hint && <span className="block mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  );
}
