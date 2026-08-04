import type { ReactNode } from "react";

/**
 * The glass card on the animated gradient used by the public auth pages
 * (/forgot-password, /reset-password). Server-component safe — holds no
 * state, so it can wrap either a server or client tree.
 *
 * Structure is ported from the V1 portal (D:\Games\Ebrigth_OSC); the palette
 * follows V2's own /login page (red/rose) rather than V1's blue, so the three
 * public auth screens read as one flow.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated background — same gradient and blob timings as /login */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-950 via-red-800 to-red-950">
        <div className="absolute inset-0 opacity-40">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-rose-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: "1s" }}></div>
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-red-700 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: "2s" }}></div>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
          {children}

          <div className="mt-8 text-center">
            <p className="text-red-100 text-xs">© 2026 HR System. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
