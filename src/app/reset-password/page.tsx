"use client";

import Link from "next/link";
import { useState, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert, KeyRound, CheckCircle } from "lucide-react";
import PasswordField from "@/app/components/PasswordField";
import AuthShell from "@/app/components/AuthShell";
import { passwordFieldErrors, MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import { resetPasswordWithToken } from "@/app/forgot-password/password-reset-actions";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fieldErrors = passwordFieldErrors(newPassword, confirmPassword);
  const blocked = Object.keys(fieldErrors).length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked || !token) return;

    setError(null);
    startTransition(async () => {
      try {
        const res = await resetPasswordWithToken(token, newPassword, confirmPassword);
        if (res.ok) {
          setSuccess(true);
        } else {
          setError(res.error || "An error occurred.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
    });
  };

  if (!token) {
    return (
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500/20 border border-amber-300/60 rounded-2xl mb-4 shadow-lg">
          <CircleAlert className="w-8 h-8 text-amber-200" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Invalid Request</h1>
        <p className="text-red-100 text-sm mb-6">
          Missing or invalid password reset token. Please request a new link.
        </p>
        <Link
          href="/forgot-password"
          className="block w-full py-3 px-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold rounded-xl text-center transition-all"
        >
          Request New Link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 border border-emerald-500/50 rounded-2xl mb-2 shadow-lg">
          <CheckCircle className="w-8 h-8 text-emerald-300" />
        </div>
        <h1 className="text-3xl font-bold text-white">Password Updated!</h1>
        <p className="text-red-100 text-sm max-w-xs mx-auto">
          Your password has been changed successfully. You can now log in with your new password.
        </p>
        <Link
          href="/login"
          className="block w-full py-3 px-4 bg-gradient-to-r from-red-600 to-rose-500 text-white font-semibold rounded-xl text-center shadow-md hover:from-red-700 hover:to-rose-600 transition-all"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 bg-amber-500/20 border border-amber-300/60 text-amber-100 text-sm py-2.5 px-3 rounded-xl font-medium"
        >
          <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <PasswordField
        id="reset-new"
        label="New Password"
        name="newPassword"
        autoComplete="new-password"
        value={newPassword}
        onChange={setNewPassword}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        error={fieldErrors.newPassword}
        show={showNew}
        onToggle={() => setShowNew((v) => !v)}
      />

      <PasswordField
        id="reset-confirm"
        label="Confirm New Password"
        name="confirmPassword"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        error={fieldErrors.confirmPassword}
        show={showConfirm}
        onToggle={() => setShowConfirm((v) => !v)}
      />

      <button
        type="submit"
        disabled={isPending || blocked}
        className="w-full py-3 px-4 bg-gradient-to-r from-red-600 to-rose-500 text-white font-semibold rounded-xl hover:from-red-700 hover:to-rose-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-red-950 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
        suppressHydrationWarning
      >
        <KeyRound className="w-4 h-4" aria-hidden="true" />
        {isPending ? "Saving..." : "Reset Password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-red-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-red-100 text-sm mt-4">Loading form...</p>
          </div>
        }
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-600 to-rose-500 rounded-2xl mb-4 shadow-lg">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Reset Password</h1>
          <p className="text-red-100 text-sm max-w-xs mx-auto">
            Please enter your new password details below.
          </p>
        </div>

        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
