"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import DashboardHome from "@/app/components/DashboardHome";
import EmployeeSelfServiceDashboard from "@/app/components/EmployeeSelfServiceDashboard";
import FinanceDashboard from "@/app/components/FinanceDashboard";
import AppShell from "@/app/components/AppShell";
import HodPendingAlert from "@/app/components/HodPendingAlert";

const FINANCE_EMAIL = "finance@ebright.my";

export default function HomePage() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      redirect("/login");
    },
  });

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-blue-600 font-semibold text-lg">
        Loading Dashboard...
      </div>
    );
  }

  const userEmail = session?.user?.email || "";
  const userRole = (session?.user as { role?: string } | undefined)?.role || "USER";
  const userPosition = (session?.user as { position?: string } | undefined)?.position ?? "";
  const userName = session?.user?.name ?? null;
  const branchName =
    (session?.user as { branchName?: string | null } | undefined)?.branchName ?? null;

  // role_type "staff" corresponds to role_id = 4 in the DB.
  const isStaff = userRole.toLowerCase() === "staff";
  const isFinance = userEmail.toLowerCase() === FINANCE_EMAIL;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <HodPendingAlert position={userPosition} />
      {isFinance ? (
        <FinanceDashboard userName={userName} />
      ) : isStaff ? (
        <EmployeeSelfServiceDashboard userName={userName} userEmail={userEmail} />
      ) : (
        <DashboardHome userRole={userRole} userEmail={userEmail} />
      )}
    </AppShell>
  );
}
