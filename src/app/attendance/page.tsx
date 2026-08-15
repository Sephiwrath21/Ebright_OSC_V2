"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import AttendanceDashboard from "@/app/components/AttendanceDashboard";

export default function AttendancePage() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      redirect("/login");
    },
  });

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-blue-600 dark:text-blue-400 font-semibold text-lg">
        Loading Attendance...
      </div>
    );
  }

  const userEmail = session?.user?.email || "";
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? "";
  const userName = session?.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <AttendanceDashboard />
    </AppShell>
  );
}
