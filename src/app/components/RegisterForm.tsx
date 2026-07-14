"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, CircleAlert, CircleCheck, Eye, EyeOff, Hourglass, Lock, Mail } from "lucide-react";
import { checkEmail, registerUser, type EmailCheckResult, type RegisterResult } from "@/app/register/actions";

const POSITION_OPTIONS = ["FT CEO", "FT HOD", "FT EXEC", "BM", "FT COACH", "PT COACH", "INTERN"];

interface OrgOpt { id: number; code: string; name: string }

type Step = "email" | "claim" | "new";

export default function RegisterForm({
  branches,
  departments,
}: {
  branches: OrgOpt[];
  departments: OrgOpt[];
}) {
  const [emailState, emailAction, emailPending] = useActionState<EmailCheckResult | null, FormData>(checkEmail, null);
  const [registerState, registerAction, registerPending] = useActionState<RegisterResult | null, FormData>(registerUser, null);

  const [step, setStep] = useState<Step>("email");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [verifiedName, setVerifiedName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (emailState?.ok && emailState.email && (emailState.status === "claim" || emailState.status === "new")) {
      setVerifiedEmail(emailState.email);
      setVerifiedName(emailState.name ?? "");
      setStep(emailState.status);
    }
  }, [emailState]);

  function backToEmail() {
    setStep("email");
    setVerifiedEmail("");
    setVerifiedName("");
    setPassword("");
    setConfirmPassword("");
  }

  const passwordValid = password.length >= 8;
  const confirmMatches = confirmPassword.length > 0 && confirmPassword === password;

  if (registerState?.success && registerState.claimed) {
    return (
      <div className="w-full max-w-md px-6">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/90 rounded-2xl mb-4 shadow-lg">
            <CircleCheck className="w-8 h-8 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Account ready</h1>
          <p className="text-red-100 text-sm leading-relaxed mb-6">
            Your password has been set. Your account was pre-registered by HR — you can sign in now.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full py-3 px-4 bg-gradient-to-r from-red-600 to-rose-500 text-white font-semibold rounded-xl hover:from-red-700 hover:to-rose-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-red-950 transition-all"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (registerState?.success) {
    return (
      <div className="w-full max-w-md px-6">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500/90 rounded-2xl mb-4 shadow-lg">
            <Hourglass className="w-8 h-8 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Waiting for approval</h1>
          <p className="text-red-100 text-sm leading-relaxed mb-6">
            Your account has been created and is pending review by a superadmin. You&apos;ll be able to sign in once it&apos;s approved.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full py-3 px-4 bg-gradient-to-r from-red-600 to-rose-500 text-white font-semibold rounded-xl hover:from-red-700 hover:to-rose-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-red-950 transition-all"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (step === "email") {
    return (
      <div className="w-full max-w-md px-6">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
          <div className="text-center mb-8">
            <img
              src="/logo.png"
              alt="Ebright"
              className="h-16 w-auto mx-auto mb-6"
            />
            <h1 className="text-3xl font-bold text-white mb-2">Create account</h1>
            <p className="text-red-200 text-sm">Enter your email to get started</p>
          </div>

          <form action={emailAction} className="space-y-5" autoComplete="off">
            {emailState?.error && (
              <div role="alert" className="flex items-start gap-2 bg-red-500/20 border border-red-500/50 text-red-100 text-sm py-2.5 px-3 rounded-xl font-medium">
                <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{emailState.error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="reg-email" className="block text-sm font-medium text-red-100 ml-1">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="w-5 h-5 text-red-200" aria-hidden="true" />
                </div>
                <input
                  id="reg-email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="name@ebright.my"
                  className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-200/50 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={emailPending}
              className="w-full py-3 px-4 bg-gradient-to-r from-red-600 to-rose-500 text-white font-semibold rounded-xl hover:from-red-700 hover:to-rose-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-red-950 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {emailPending ? "Checking..." : "Continue"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-red-200">
            Already have an account?{" "}
            <Link href="/login" className="text-white font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const isClaim = step === "claim";

  return (
    <div className="w-full max-w-md px-6">
      <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="Ebright"
            className="h-16 w-auto mx-auto mb-6"
          />
          <h1 className="text-3xl font-bold text-white mb-2">
            {isClaim ? `Welcome, ${verifiedName || verifiedEmail}` : "Create account"}
          </h1>
          <p className="text-red-200 text-sm">
            {isClaim
              ? "Your account was pre-registered by HR. Set a password to activate it."
              : "Fill in your details — pending superadmin approval"}
          </p>
        </div>

        <div className="mb-5 flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Mail className="w-4 h-4 text-red-200 shrink-0" aria-hidden="true" />
            <span className="text-sm text-red-100 truncate">{verifiedEmail}</span>
          </div>
          <button
            type="button"
            onClick={backToEmail}
            className="flex items-center gap-1 text-xs text-red-200 hover:text-white transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Change
          </button>
        </div>

        <form action={registerAction} className="space-y-5" autoComplete="off">
          <input type="hidden" name="email" value={verifiedEmail} />

          {!isClaim && (
            <>
              <div className="space-y-2">
                <label htmlFor="reg-full-name" className="block text-sm font-medium text-red-100 ml-1">Full Name</label>
                <input
                  id="reg-full-name"
                  name="fullName"
                  type="text"
                  required
                  placeholder="e.g. AINA SOFEA BINTI HAMID"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-200/50 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition-all"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="reg-orgunit" className="block text-sm font-medium text-red-100 ml-1">Branch / Department</label>
                <div className="relative">
                  <select
                    id="reg-orgunit"
                    name="orgUnit"
                    defaultValue=""
                    required
                    className="w-full pl-4 pr-10 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition-all appearance-none cursor-pointer"
                  >
                    <option value="" className="text-slate-900" disabled>Select branch or department</option>
                    <optgroup label="Branches" className="text-slate-900">
                      {branches.map((b) => (
                        <option key={`b-${b.id}`} value={`branch:${b.id}`} className="text-slate-900">{b.code} — {b.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Departments" className="text-slate-900">
                      {departments.map((d) => (
                        <option key={`d-${d.id}`} value={`dept:${d.id}`} className="text-slate-900">{d.code} — {d.name}</option>
                      ))}
                    </optgroup>
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-200 rotate-90" aria-hidden="true" />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="reg-position" className="block text-sm font-medium text-red-100 ml-1">Position</label>
                <div className="relative">
                  <select
                    id="reg-position"
                    name="position"
                    defaultValue=""
                    required
                    className="w-full pl-4 pr-10 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition-all appearance-none cursor-pointer"
                  >
                    <option value="" className="text-slate-900" disabled>Select position</option>
                    {POSITION_OPTIONS.map((p) => (
                      <option key={p} value={p} className="text-slate-900">{p}</option>
                    ))}
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-200 rotate-90" aria-hidden="true" />
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <label htmlFor="reg-password" className="block text-sm font-medium text-red-100 ml-1">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="w-5 h-5 text-red-200" aria-hidden="true" />
              </div>
              <input
                id="reg-password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-200/50 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-red-200 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
              </button>
            </div>
            {password.length > 0 && (
              <p className={`flex items-center gap-1.5 text-xs ml-1 ${passwordValid ? "text-emerald-300" : "text-red-300"}`}>
                {passwordValid ? <CircleCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <CircleAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                {passwordValid ? "Acceptable password" : "Password must be at least 8 characters long"}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="reg-confirm" className="block text-sm font-medium text-red-100 ml-1">Confirm password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="w-5 h-5 text-red-200" aria-hidden="true" />
              </div>
              <input
                id="reg-confirm"
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-200/50 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-red-200 hover:text-white transition-colors"
              >
                {showConfirm ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
              </button>
            </div>
            {confirmPassword.length > 0 && (
              <p className={`flex items-center gap-1.5 text-xs ml-1 ${confirmMatches ? "text-emerald-300" : "text-red-300"}`}>
                {confirmMatches ? <CircleCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <CircleAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                {confirmMatches ? "Password match" : "Password does not match"}
              </p>
            )}
          </div>

          {registerState?.error && (
            <div role="alert" className="flex items-start gap-2 bg-red-500/20 border border-red-500/50 text-red-100 text-sm py-2.5 px-3 rounded-xl font-medium">
              <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{registerState.error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={registerPending}
            className="w-full py-3 px-4 bg-gradient-to-r from-red-600 to-rose-500 text-white font-semibold rounded-xl hover:from-red-700 hover:to-rose-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-red-950 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {registerPending
              ? (isClaim ? "Setting password..." : "Creating account...")
              : (isClaim ? "Set password" : "Create account")}
          </button>
        </form>

        {!isClaim && (
          <p className="mt-8 text-center text-xs text-red-200/70">
            Accounts created here are staff-level and require superadmin approval before you can sign in.
          </p>
        )}
      </div>
    </div>
  );
}
