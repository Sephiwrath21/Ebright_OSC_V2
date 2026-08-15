// Home — server component (converted from useSession): resolves the session
// server-side, same pattern as /task-manager, and routes to the right
// per-account dashboard. EVERY dashboard receives the same server-fetched
// Task Manager overview section (`taskOverview` slot) — scoped by the data
// layer per role (org grids / all departments / own department / own branch
// / personal) and always carrying the date filters (2026-07-28 "no
// exceptions" requirement). Client dashboards still fetch their own other
// widget data exactly as before.
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireLiveSession } from "@/task-manager/action-session";
import {
  completeFlowTask,
  reopenFlowTask,
  skipFlowTask,
  uploadFlowTaskProof,
  removeFlowTaskProof,
  FlowBridgeError,
} from "@/task-manager/data";
import type { ActionResult, ProofUploadResult, ProofRemoveResult } from "@/task-manager/ui/types";
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
import { HomeScopedOverviewSection } from "./scoped-overview-section";

const FINANCE_EMAIL = "finance@ebright.my";

/** Strict YYYY-MM-DD or nothing — anything else falls back to today (the
 *  data layer's own default when the date is omitted). Same rule as
 *  /task-manager's Daily filter. */
const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ?mrange= — the Monthly 7-day chunk ("1-7" … "29-31"); invalid = Full month. */
const MRANGE_RE = /^(\d{1,2})-(\d{1,2})$/;

function parseMonthRange(raw?: string): { from: number; to: number } | undefined {
  const m = raw?.match(MRANGE_RE);
  if (!m) return undefined;
  const from = Number(m[1]);
  const to = Number(m[2]);
  return from >= 1 && from <= to && to <= 31 ? { from, to } : undefined;
}

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  // Overview date filters: ?date= anchors the Daily half, ?mdate= the
  // Monthly half, ?adate= the Ad hoc regions (org views only), ?hdate= the
  // HOD-assigned card (staff view) — all independent of each other.
  searchParams: Promise<{
    date?: string;
    mdate?: string;
    mrange?: string;
    adate?: string;
    hdate?: string;
    cdate?: string;
    /** Which Branch Status by Region sections are expanded (2026-08-15) —
     *  see expand-param.ts. Passed through verbatim; validated there, not
     *  here (unlike the date params, it has no fixed format to check). */
    expand?: string;
    /** Which department the org-wide "All Departments" dropdown shows
     *  (2026-08-15 rebuild #2). Passed through verbatim; validated against
     *  FLOW_DEPARTMENTS in scoped-overview-section.tsx, not here. */
    department?: string;
    /** Branch Manager's personal Ad hoc day anchor (2026-08-15) — mirrors
     *  ?hdate=/?cdate= exactly. Passed through verbatim; defaulted to
     *  today in scoped-overview-section.tsx, not here. */
    padate?: string;
  }>;
}) {
  const sp = await searchParams;
  const dailyDate = sp.date && DATE_PARAM_RE.test(sp.date) ? sp.date : undefined;
  const monthlyDate = sp.mdate && DATE_PARAM_RE.test(sp.mdate) ? sp.mdate : undefined;
  const monthlyRange = parseMonthRange(sp.mrange);
  const adhocDate = sp.adate && DATE_PARAM_RE.test(sp.adate) ? sp.adate : undefined;
  const hodDate = sp.hdate && DATE_PARAM_RE.test(sp.hdate) ? sp.hdate : undefined;
  const ceoDate = sp.cdate && DATE_PARAM_RE.test(sp.cdate) ? sp.cdate : undefined;
  const expand = sp.expand;
  const department = sp.department;
  const padate = sp.padate && DATE_PARAM_RE.test(sp.padate) ? sp.padate : undefined;
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
  // HOD and Branch Manager get the same self-service (own-data) home as staff.
  const isHod = userRole.toLowerCase() === "hod";
  const isBranchManager = userRole.toLowerCase() === "branch manager";
  const isSelfService = isStaff || isHod || isBranchManager;
  const isFinance = userEmail.toLowerCase() === FINANCE_EMAIL;
  const isOD = userEmail.toLowerCase() === "od@ebright.my";
  const isOperations = userEmail.toLowerCase() === "operations@ebright.my";
  const isMarketing = userEmail.toLowerCase() === "marketing@ebright.my";
  const isAcademy = userEmail.toLowerCase() === "academy@ebright.my";
  const isBranch = userRole.toLowerCase() === "branch";
  const isHr = userRole.toLowerCase() === "hr" || userId === "175";

  // Personal-task actions for the overview's drill modals (same expected-
  // errors-are-RETURNED pattern as /task-manager — production masks thrown
  // server-action messages). The data layer enforces assignee-only.
  const FALLBACK_MESSAGE = "Something went wrong — please try again";
  async function completeTask(runBlockId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(userEmail);
    if (stale) return stale;
    try {
      await completeFlowTask(userEmail, runBlockId);
      revalidatePath("/home");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
  async function skipTask(runBlockId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(userEmail);
    if (stale) return stale;
    try {
      await skipFlowTask(userEmail, runBlockId);
      revalidatePath("/home");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
  async function reopenTask(runBlockId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(userEmail);
    if (stale) return stale;
    try {
      await reopenFlowTask(userEmail, runBlockId);
      revalidatePath("/home");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
  async function uploadProof(
    runBlockId: string,
    image: { mime: string; dataBase64: string },
  ): Promise<ProofUploadResult> {
    "use server";
    const stale = await requireLiveSession(userEmail);
    if (stale) return stale;
    try {
      const { proofId } = await uploadFlowTaskProof(userEmail, runBlockId, image);
      revalidatePath("/home");
      return { ok: true, proofId };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
  async function removeProof(proofId: string): Promise<ProofRemoveResult> {
    "use server";
    const stale = await requireLiveSession(userEmail);
    if (stale) return stale;
    try {
      await removeFlowTaskProof(userEmail, proofId);
      revalidatePath("/home");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  // One overview for every account type — the section itself resolves the
  // Task Manager role and scopes/routes accordingly (and renders nothing on
  // any Task Manager failure, so no dashboard can break because of it).
  const taskOverview = (
    <Suspense fallback={null}>
      <HomeScopedOverviewSection
        email={userEmail}
        dailyDate={dailyDate}
        monthlyDate={monthlyDate}
        monthlyRange={monthlyRange}
        adhocDate={adhocDate}
        hodDate={hodDate}
        ceoDate={ceoDate}
        expand={expand}
        department={department}
        padate={padate}
        actions={{
          complete: completeTask,
          skip: skipTask,
          reopen: reopenTask,
          uploadProof,
          removeProof,
        }}
      />
    </Suspense>
  );

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <HodPendingAlert position={userPosition} />
      {isOD ? (
        <ODDashboard userName={userName} userEmail={userEmail} taskOverview={taskOverview} />
      ) : isOperations ? (
        <OperationsDashboard userName={userName} userEmail={userEmail} taskOverview={taskOverview} />
      ) : isMarketing ? (
        <MarketingDashboard userName={userName} userEmail={userEmail} taskOverview={taskOverview} />
      ) : isAcademy ? (
        <AcademyDashboard userName={userName} userEmail={userEmail} taskOverview={taskOverview} />
      ) : isBranch ? (
        <BranchDashboard
          userName={userName}
          userEmail={userEmail}
          branchName={branchName}
          taskOverview={taskOverview}
        />
      ) : isFinance ? (
        <FinanceDashboard userName={userName} userEmail={userEmail} taskOverview={taskOverview} />
      ) : isSelfService ? (
        <EmployeeSelfServiceDashboard
          userName={userName}
          userEmail={userEmail}
          taskOverview={taskOverview}
        />
      ) : isHr ? (
        <HrPersonalizedDashboard
          userName={userName}
          userEmail={userEmail}
          taskOverview={taskOverview}
        />
      ) : (
        <DashboardHome userRole={userRole} userEmail={userEmail} taskOverview={taskOverview} />
      )}
    </AppShell>
  );
}
