"use client";

import { CircleAlert, Eye, EyeOff, Lock } from "lucide-react";

/**
 * Password input for the public /reset-password page: lock icon, show/hide
 * toggle, and a hint line that turns into an error line when `error` is set.
 * Pass value+onChange for live validation; omit both to leave it uncontrolled.
 *
 * Ported from the V1 portal, retinted to /login's red palette. Invalid fields
 * switch to an amber ring rather than V1's red one — on this background red
 * would be hard to tell apart from the normal state.
 */
export default function PasswordField({
  id,
  label,
  name,
  autoComplete,
  hint,
  error,
  value,
  onChange,
  show,
  onToggle,
}: {
  id: string;
  label: string;
  name: string;
  autoComplete: string;
  hint?: string;
  error?: string;
  value?: string;
  onChange?: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-red-100 ml-1">
        {label}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Lock className="w-5 h-5 text-red-200" />
        </div>
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          required
          // No minLength: the browser's native "must be N characters" bubble
          // would pre-empt the message rendered below.
          autoComplete={autoComplete}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full pl-12 pr-12 py-3 bg-white/10 border rounded-xl text-white placeholder-red-200/50 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
            error ? "border-amber-300/80 focus:ring-amber-300" : "border-white/20 focus:ring-red-400"
          }`}
          suppressHydrationWarning
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 pr-4 flex items-center text-red-200 hover:text-white transition-colors"
          suppressHydrationWarning
        >
          {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>

      {error ? (
        <span
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-1.5 ml-1 text-xs font-medium text-amber-200"
        >
          <CircleAlert className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className="block ml-1 text-xs text-red-100/80">
            {hint}
          </span>
        )
      )}
    </div>
  );
}
