"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, CircleAlert, KeyRound, Mail, CheckCircle } from "lucide-react";
import AuthShell from "@/app/components/AuthShell";
import { requestPasswordReset, type RequestResetResult } from "./password-reset-actions";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<RequestResetResult | null, FormData>(
    requestPasswordReset,
    null,
  );

  return (
    <AuthShell>
      <Link
        href="/login"
        className="inline-flex items-center text-red-200 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to login
      </Link>

      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-600 to-rose-500 rounded-2xl mb-4 shadow-lg">
          <KeyRound className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Reset Password</h1>
        <p className="text-red-100 text-sm">
          {state?.ok
            ? "Check your inbox for a recovery link."
            : "Enter your email address to receive a secure password reset link."}
        </p>
      </div>

      {state?.ok ? (
        <div className="space-y-6 text-center">
          <div className="flex flex-col items-center gap-3 bg-emerald-500/20 border border-emerald-500/50 text-emerald-100 py-6 px-4 rounded-2xl font-medium">
            <CheckCircle className="w-12 h-12 text-emerald-300 shrink-0" />
            <p className="text-sm leading-relaxed max-w-sm mt-2">
              {state.message || "If an account exists with that email, a password reset link has been sent."}
            </p>
          </div>
          <Link
            href="/login"
            className="block w-full py-3 px-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold rounded-xl text-center transition-all"
          >
            Return to Login
          </Link>
        </div>
      ) : (
        <form action={formAction} className="space-y-6" autoComplete="off">
          {state?.error && (
            <div
              role="alert"
              className="flex items-start gap-2 bg-amber-500/20 border border-amber-300/60 text-amber-100 text-sm py-2.5 px-3 rounded-xl font-medium"
            >
              <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{state.error}</span>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="reset-email" className="block text-sm font-medium text-red-100 ml-1">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail className="w-5 h-5 text-red-200" />
              </div>
              <input
                id="reset-email"
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="name@ebright.my"
                className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-200/50 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition-all"
                suppressHydrationWarning
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full py-3 px-4 bg-gradient-to-r from-red-600 to-rose-500 text-white font-semibold rounded-xl hover:from-red-700 hover:to-rose-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-red-950 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
            suppressHydrationWarning
          >
            <Mail className="w-4 h-4" aria-hidden="true" />
            {pending ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
