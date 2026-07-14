"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Lock, Mail, CircleCheck } from "lucide-react";
import { signIn } from "next-auth/react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Invalid email or password");
      } else if (res?.ok) {
        router.push("/home");
      }
    } catch (err) {
      console.error(err);
      setError("A network error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-red-950 via-red-800 to-red-950">
        <div className="absolute inset-0 opacity-40">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-rose-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-red-700 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
          <div className="text-center mb-8">
            <img
              src="/logo.png"
              alt="Ebright"
              className="h-16 w-auto mx-auto mb-6"
            />
            <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
            <p className="text-red-100 text-sm">Sign in to your account</p>
          </div>

          {justRegistered && (
            <div role="status" className="mb-5 flex items-start gap-2 bg-emerald-500/20 border border-emerald-500/50 text-emerald-100 text-sm py-2.5 px-3 rounded-xl font-medium">
              <CircleCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Account created. Please sign in.</span>
            </div>
          )}

          {/* method="post" is the no-JS fallback so the browser never falls
              back to GET — which would leak email + password into the URL bar
              and server logs. The handleSubmit handler still preventDefault()s
              and signs in via NextAuth when JS is loaded. */}
          <form onSubmit={handleSubmit} method="post" className="space-y-6" autoComplete="off">
            <div className="space-y-2">
              <label htmlFor="login-email" className="block text-sm font-medium text-red-100 ml-1">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="w-5 h-5 text-red-200" />
                </div>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@ebright.my"
                  className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-200/50 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition-all"
                  autoFocus
                  // Password managers / autofill extensions inject attributes
                  // (e.g. fdprocessedid, data-lastpass-*) onto form controls after
                  // SSR, which trips a recoverable hydration warning. Suppress it.
                  suppressHydrationWarning
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-red-100 ml-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-red-200" />
                </div>
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  placeholder="Enter your password"
                  className="w-full pl-12 pr-12 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-200/50 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition-all"
                  suppressHydrationWarning
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-red-200 hover:text-white transition-colors"
                  suppressHydrationWarning
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-white/30 bg-white/10 text-red-500 focus:ring-red-400 focus:ring-offset-0"
                />
                <span className="text-red-100">Remember me</span>
              </label>
              <Link href="/forgot-password" className="text-red-200 hover:text-white transition-colors">
                Forgot password?
              </Link>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-200 text-sm text-center py-2.5 rounded-xl font-medium animate-pulse">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-red-600 to-rose-500 text-white font-semibold rounded-xl hover:from-red-700 hover:to-rose-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-red-950 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              suppressHydrationWarning
            >
              {isLoading ? (
                <span className="flex items-center justify-center space-x-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Signing in...</span>
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-red-100">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-white font-semibold hover:underline">
              Sign up
            </Link>
          </p>

          <div className="mt-6 text-center">
            <p className="text-red-100 text-xs">
              © 2026 HR System. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
