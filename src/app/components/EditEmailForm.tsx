"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, Mail, CircleAlert } from "lucide-react";
import { updateEmail, type UpdateEmailResult } from "@/app/profile/actions";

export default function EditEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction, pending] = useActionState<UpdateEmailResult | null, FormData>(updateEmail, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="p-6 space-y-5" autoComplete="off">
      {state?.error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-md border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900 text-sm text-red-800 dark:text-red-200">
          <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Current Email</label>
        <div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300">
          <Mail className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="truncate">{currentEmail}</span>
        </div>
      </div>

      <label htmlFor="new-email" className="block">
        <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          New Email
          <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
        </span>
        <input
          id="new-email"
          name="newEmail"
          type="email"
          required
          placeholder="name@ebright.my"
          className="block w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </label>

      <label htmlFor="current-password" className="block">
        <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          Current Password
          <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
        </span>
        <div className="relative">
          <input
            id="current-password"
            name="currentPassword"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            className="block w-full h-10 pl-3 pr-10 rounded-lg border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
          </button>
        </div>
        <span className="block mt-1 text-xs text-slate-500 dark:text-slate-400">We confirm with your password to keep your account safe.</span>
      </label>

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
          <Mail className="w-4 h-4" aria-hidden="true" />
          {pending ? "Updating..." : "Update Email"}
        </button>
      </div>
    </form>
  );
}
