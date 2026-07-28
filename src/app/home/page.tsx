// Home — server component (converted from useSession): resolves the session
// server-side, same pattern as /task-manager, and routes to the right
// per-account dashboard. Server-side so the superadmin (od@) branch can
// compose the server-fetched Task Manager overview section into its
// dashboard (ODDashboard's `taskOverview` slot), and the department
// dashboards (Operations/Marketing/Academy) get their own-department
// Task Manager section the same way — other client dashboards still
// fetch their own widget data exactly as before.
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import DashboardHome from "@/app/components/DashboardHome";
import EmployeeSelfServiceDashboard from "@/app/components/EmployeeSelfServiceDashboard";
import FinanceDashboard from "@/app/components/FinanceDashboard";
import ODDashboard from "@/app/components/ODDashboard";
import OperationsDashboard from "@/app/components/OperationsDashboard";
import MarketingDashboard from "@/app/components/MarketingDashboard";
import AcademyDashboard from "@/app/components/AcademyDashboard";
import BranchDashboard from "@/app/components/BranchDashboard";
import HrPersonalizedDashboard from "@/app/components/HrPersonalizedDashboard";
import AppShell from "@/app/components/AppShell";
import HodPendingAlert from "@/app/components/HodPendingAlert";
import { HomeOverviewSection } from "./overview-section";
import { HomeDeptOverviewSection } from "./dept-overview-section";

const FINANCE_EMAIL = "finance@ebright.my";

/** Strict YYYY-MM-DD or nothing — anything else falls back to today (the
 *  data layer's own default when the date is omitted). Same rule as
 *  /task-manager's Daily filter. */
const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  // Overview date filters (superadmin section): ?date= anchors the Daily
  // half, ?mdate= the Monthly half, ?adate= the Ad hoc regions — all
  // independent of each other.
  searchParams: Promise<{ date?: string; mdate?: string; adate?: string }>;
}) {
  const sp = await searchParams;
  const dailyDate = sp.date && DATE_PARAM_RE.test(sp.date) ? sp.date : undefined;
  const monthlyDate = sp.mdate && DATE_PARAM_RE.test(sp.mdate) ? sp.mdate : undefined;
  const adhocDate = sp.adate && DATE_PARAM_RE.test(sp.adate) ? sp.adate : undefined;
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as {
    email: string;
    name?: string | null;
    id?: string;
    role?: string;
    position?: string | null;
    branchName?: string | null;
  };

  const userEmail = su.email;
  const userId = su.id ?? "";
  const userRole = su.role || "USER";
  const userPosition = su.position ?? "";
  const userName = su.name ?? null;
  const branchName = su.branchName ?? null;

  // role_type "staff" corresponds to role_id = 4 in the DB.
  const isStaff = userRole.toLowerCase() === "staff";
  const isFinance = userEmail.toLowerCase() === FINANCE_EMAIL;
  const isOD = userEmail.toLowerCase() === "od@ebright.my";
  const isOperations = userEmail.toLowerCase() === "operations@ebright.my";
  const isMarketing = userEmail.toLowerCase() === "marketing@ebright.my";
  const isAcademy = userEmail.toLowerCase() === "academy@ebright.my";
  const isBranch = userRole.toLowerCase() === "branch";
  const isHr = userRole.toLowerCase() === "hr" || userId === "175";

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <HodPendingAlert position={userPosition} />
      {isOD ? (
        <ODDashboard
          userName={userName}
          userEmail={userEmail}
          taskOverview={
            <Suspense fallback={null}>
              <HomeOverviewSection
                email={userEmail}
                dailyDate={dailyDate}
                monthlyDate={monthlyDate}
                adhocDate={adhocDate}
              />
            </Suspense>
          }
        />
      ) : isOperations ? (
        <OperationsDashboard
          userName={userName}
          userEmail={userEmail}
          taskOverview={
            <Suspense fallback={null}>
              <HomeDeptOverviewSection email={userEmail} />
            </Suspense>
          }
        />
      ) : isMarketing ? (
        <MarketingDashboard
          userName={userName}
          userEmail={userEmail}
          taskOverview={
            <Suspense fallback={null}>
              <HomeDeptOverviewSection email={userEmail} />
            </Suspense>
          }
        />
      ) : isAcademy ? (
        <AcademyDashboard
          userName={userName}
          userEmail={userEmail}
          taskOverview={
            <Suspense fallback={null}>
              <HomeDeptOverviewSection email={userEmail} />
            </Suspense>
          }
        />
      ) : isBranch ? (
        <BranchDashboard userName={userName} userEmail={userEmail} branchName={branchName} />
      ) : isFinance ? (
        <FinanceDashboard userName={userName} userEmail={userEmail} />
      ) : isStaff ? (
        <EmployeeSelfServiceDashboard userName={userName} userEmail={userEmail} />
      ) : isHr ? (
        <HrPersonalizedDashboard userName={userName} userEmail={userEmail} />
      ) : (
        <DashboardHome userRole={userRole} userEmail={userEmail} />
      )}
    </AppShell>
  );
}
