// /task-manager — the role-scoped Task Manager view (replaces the old
// ClickUp Tasks feature). Wiring mirrors the donor's osc-demo page: this
// server component fetches all payloads, defines the server actions (each
// closing over the session email), and passes both down as props — the
// client components never fetch and never see an identity primitive.
//
// 2026-07-24 redesign: Superadmin gets a Department|Branch toggle + dropdown
// with the selected entity's full Daily+Monthly detail inline (the folded-in
// Department Overview page, generalized to branches); the elevated
// department sites (Operation/Optimisation — isElevatedDeptSite) get the
// department dropdown only; every other role keeps TaskManagerView, with
// HOD/DEPT_SITE's detail now inline there too. "+ Task" sits in the page
// header for superadmin + elevated sites.
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireLiveSession } from "@/task-manager/action-session";
import AppShell from "@/app/components/AppShell";
import {
  assignFlowTask,
  completeFlowTask,
  createKanbanCard,
  createKanbanColumn,
  deleteKanbanCard,
  deleteKanbanColumn,
  getBranchDetail,
  getCeoDashboardConfig,
  getDepartmentDetail,
  getFlowDetail,
  getFlowStaff,
  getHodKanban,
  moveKanbanCard,
  moveKanbanColumn,
  reassignFlowTask,
  recolorKanbanColumn,
  renameKanbanColumn,
  reopenFlowTask,
  saveCeoDashboardConfig,
  skipFlowTask,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { isElevatedDeptSite } from "@/task-manager/analytics/_lib";
import { TaskManagerView } from "@/task-manager/ui/task-manager-view";
import { AddTaskButton } from "@/task-manager/ui/add-task-button";
import { EntityOverviewSection } from "@/task-manager/ui/department-overview";
import {
  DailyDatePicker,
  EntityPicker,
  MonthDropdown,
  MonthRangeDropdown,
  MonthSidebar,
  WeekdaySidebar,
} from "@/task-manager/ui/entity-picker";
import {
  FLOW_BRANCH_REGIONS,
  FLOW_DEPARTMENTS,
  type ActionResult,
  type AssignActionResult,
  type FlowAssignInput,
  type FlowKanbanColumnColor,
} from "@/task-manager/ui/types";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";

export const dynamic = "force-dynamic";

const ALL_BRANCHES: string[] = FLOW_BRANCH_REGIONS.flatMap((r) => [...r.branches]);
/** Fullest demo roster — the least-empty default for the Branch mode. */
const DEFAULT_BRANCH = "Subang Taipan";

/** Superadmin's top-level mode switch — Department or Branch, never both.
 *  Carries the selected Daily date across so switching modes keeps it. */
function ModeTabs({ active, date }: { active: "department" | "branch"; date?: string }) {
  const base = "rounded-lg px-4 py-1.5 text-sm font-medium";
  const on = "bg-white text-gray-900 shadow-sm";
  const off = "text-gray-500 hover:text-gray-700";
  const suffix = date ? `&date=${date}` : "";
  return (
    <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1">
      <Link
        href={`/task-manager?view=department${suffix}`}
        className={`${base} ${active === "department" ? on : off}`}
      >
        Department
      </Link>
      <Link
        href={`/task-manager?view=branch${suffix}`}
        className={`${base} ${active === "branch" ? on : off}`}
      >
        Branch
      </Link>
    </div>
  );
}

/** Strict YYYY-MM-DD or nothing — anything else falls back to today (the
 *  data layer's own default when `date` is omitted). */
const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ?mrange= — the Monthly 7-day chunk ("1-7" … "29-31"). Anything invalid
 *  falls back to Full month. */
const MRANGE_RE = /^(\d{1,2})-(\d{1,2})$/;

function parseMonthRange(raw?: string): { from: number; to: number } | undefined {
  const m = raw?.match(MRANGE_RE);
  if (!m) return undefined;
  const from = Number(m[1]);
  const to = Number(m[2]);
  return from >= 1 && from <= to && to <= 31 ? { from, to } : undefined;
}

export default async function TaskManagerPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    view?: string;
    department?: string;
    branch?: string;
    date?: string;
    mdate?: string;
    mrange?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  const sp = await searchParams;
  const period = sp.period === "monthly" ? "monthly" : "daily";
  const href = (p: string) => `/task-manager?period=${p}`;
  // Date filters: ?date= drives every DAILY surface (entity Details AND the
  // personal Daily donut/list, 2026-07-28); ?mdate= drives the personal
  // Monthly pair (any picked date = that date's whole month). Undefined =
  // today / current month.
  const dailyDate = sp.date && DATE_PARAM_RE.test(sp.date) ? sp.date : undefined;
  const monthlyDate = sp.mdate && DATE_PARAM_RE.test(sp.mdate) ? sp.mdate : undefined;
  // Monthly 7-day chunk within the anchor month (2026-07-29 Monthly
  // selector redesign) — undefined = Full month.
  const monthlyRange = parseMonthRange(sp.mrange);
  const monthlyRangeParam = monthlyRange ? `${monthlyRange.from}-${monthlyRange.to}` : undefined;
  // Params each side's controls carry along unchanged.
  const monthlyCarry: Record<string, string> = {
    ...(monthlyDate ? { mdate: monthlyDate } : {}),
    ...(monthlyRangeParam ? { mrange: monthlyRangeParam } : {}),
  };
  const dailyCarry: Record<string, string> = dailyDate ? { date: dailyDate } : {};

  // Expected errors are RETURNED, never thrown: Next.js masks thrown
  // server-action error messages in production, so every action here catches
  // and maps to { ok:false, message } instead of letting the framework
  // swallow it. revalidatePath only runs on the success path.
  const FALLBACK_MESSAGE = "Something went wrong — please try again";

  async function assign(input: FlowAssignInput): Promise<AssignActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await assignFlowTask(email, input);
      revalidatePath("/task-manager");
      return { ok: true, created: result.created };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function completeTask(runBlockId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await completeFlowTask(email, runBlockId);
      revalidatePath("/task-manager");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function skipTask(runBlockId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await skipFlowTask(email, runBlockId);
      revalidatePath("/task-manager");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function reopenTask(runBlockId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await reopenFlowTask(email, runBlockId);
      revalidatePath("/task-manager");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function reassignTask(runBlockId: string, newAssigneeId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await reassignFlowTask(email, runBlockId, newAssigneeId);
      revalidatePath("/task-manager");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  // CEO pinned-department boards: Daily and Monthly are fully independent —
  // each cadence gets its own actions, closed over a fixed cadence.
  function makeCeoActions(cadence: "daily" | "monthly") {
    async function add(department: string): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        const { departments } = await getCeoDashboardConfig(email, cadence);
        if (!departments.includes(department)) {
          await saveCeoDashboardConfig(email, cadence, [...departments, department]);
        }
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    }
    async function remove(department: string): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        const { departments } = await getCeoDashboardConfig(email, cadence);
        await saveCeoDashboardConfig(email, cadence, departments.filter((d) => d !== department));
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    }
    async function reorder(orderedNames: string[]): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await saveCeoDashboardConfig(email, cadence, orderedNames);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    }
    return { add, remove, reorder };
  }
  const ceoDailyActions = makeCeoActions("daily");
  const ceoMonthlyActions = makeCeoActions("monthly");

  const hodKanbanActions = {
    async create(column: string, title: string): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await createKanbanCard(email, column, title);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async move(cardId: string, column: string, order: number): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await moveKanbanCard(email, cardId, column, order);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async remove(cardId: string): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await deleteKanbanCard(email, cardId);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async createColumn(label: string): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await createKanbanColumn(email, label);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async renameColumn(columnId: string, label: string): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await renameKanbanColumn(email, columnId, label);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async moveColumn(columnId: string, order: number): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await moveKanbanColumn(email, columnId, order);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async recolorColumn(columnId: string, color: FlowKanbanColumnColor | null): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await recolorKanbanColumn(email, columnId, color);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async deleteColumn(columnId: string): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await deleteKanbanColumn(email, columnId);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
  };

  let body: ReactNode;
  let headerAction: ReactNode = null;
  try {
    const [daily, monthly, { staff }] = await Promise.all([
      getFlowDetail(email, "daily", dailyDate),
      getFlowDetail(email, "monthly", monthlyDate, monthlyRange ? { monthDays: monthlyRange } : undefined),
      getFlowStaff(),
    ]);
    const role = daily.me.me.role;
    const elevatedDeptSite = isElevatedDeptSite({
      role,
      department: daily.me.me.department ?? null,
    });
    // "Assign to Others" — same 5 identities as the assign form; the data
    // layer re-checks (incl. HOD's own-department scoping) on every call.
    const canReassign =
      role === "ADMIN" || role === "CEO" || role === "OPS" || role === "HOD" || elevatedDeptSite;
    const reassign = canReassign ? { staff, action: reassignTask } : undefined;

    if (role === "ADMIN" || elevatedDeptSite) {
      // Superadmin + elevated department sites (Operation/Optimisation):
      // dropdown-driven entity overview. ADMIN gets the Department|Branch
      // toggle; elevated sites are department-only (no branch visibility by
      // design — getBranchDetail would 403 them anyway). "+ Task" renders in
      // the page header, above whatever mode is active.
      headerAction = <AddTaskButton staff={staff} action={assign} />;

      const view: "department" | "branch" =
        role === "ADMIN" && sp.view === "branch" ? "branch" : "department";

      let overview: ReactNode;
      if (view === "department") {
        // Default to the ACCOUNT'S OWN department when it has one — the
        // elevated sites always do, and od@ (Superadmin = the Optimisation
        // Department's login) carries Optimisation since the 2026-07-25
        // decision. First list item only as the last resort.
        const own = daily.me.me.department;
        const fallback =
          own && (FLOW_DEPARTMENTS as readonly string[]).includes(own)
            ? own
            : FLOW_DEPARTMENTS[0];
        const department =
          sp.department && (FLOW_DEPARTMENTS as readonly string[]).includes(sp.department)
            ? sp.department
            : fallback;
        const [dailyDetail, monthlyDetail] = await Promise.all([
          getDepartmentDetail(email, department, "daily", dailyDate),
          getDepartmentDetail(email, department, "monthly"),
        ]);
        overview = (
          <>
            <EntityPicker
              label="Department"
              value={department}
              groups={[{ options: FLOW_DEPARTMENTS }]}
              param="department"
              basePath="/task-manager"
              extraParams={{ view: "department", ...(dailyDate ? { date: dailyDate } : {}) }}
            />
            <EntityOverviewSection
              label="Daily"
              entity={dailyDetail.department}
              kind="department"
              reassign={reassign}
              headerControl={
                <DailyDatePicker
                  key="admin-dept-daily-picker"
                  value={dailyDetail.date}
                  basePath="/task-manager"
                  extraParams={{ view: "department", department }}
                />
              }
            />
            <EntityOverviewSection
              label="Monthly"
              entity={monthlyDetail.department}
              kind="department"
              reassign={reassign}
            />
          </>
        );
      } else {
        const branch =
          sp.branch && ALL_BRANCHES.includes(sp.branch) ? sp.branch : DEFAULT_BRANCH;
        const [dailyDetail, monthlyDetail] = await Promise.all([
          getBranchDetail(email, branch, "daily", dailyDate),
          getBranchDetail(email, branch, "monthly"),
        ]);
        overview = (
          <>
            <EntityPicker
              label="Branch"
              value={branch}
              groups={FLOW_BRANCH_REGIONS.map((r) => ({
                label: r.name,
                options: r.branches,
              }))}
              param="branch"
              basePath="/task-manager"
              extraParams={{ view: "branch", ...(dailyDate ? { date: dailyDate } : {}) }}
            />
            <EntityOverviewSection
              label="Daily"
              entity={dailyDetail.branch}
              kind="branch"
              reassign={reassign}
              headerControl={
                <DailyDatePicker
                  key="admin-branch-daily-picker"
                  value={dailyDetail.date}
                  basePath="/task-manager"
                  extraParams={{ view: "branch", branch }}
                />
              }
            />
            <EntityOverviewSection
              label="Monthly"
              entity={monthlyDetail.branch}
              kind="branch"
              reassign={reassign}
            />
          </>
        );
      }

      body = (
        <div className="flex flex-col gap-6">
          {role === "ADMIN" && <ModeTabs active={view} date={dailyDate} />}
          {overview}
        </div>
      );

      return (
        <AppShell email={email} role={su.role} name={su.name}>
          <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">Task Manager</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Your tasks, team status, and assignments — daily and monthly.
                </p>
              </div>
              {headerAction}
            </div>
            {body}
          </div>
        </AppShell>
      );
    }

    // CEO only: each cadence's own pinned list + donut data, independently.
    let ceoDashboard: Parameters<typeof TaskManagerView>[0]["ceoDashboard"];
    if (daily.me.me.role === "CEO") {
      const [dailyConfig, monthlyConfig] = await Promise.all([
        getCeoDashboardConfig(email, "daily"),
        getCeoDashboardConfig(email, "monthly"),
      ]);
      const [dailyDetails, monthlyDetails] = await Promise.all([
        Promise.all(dailyConfig.departments.map((name) => getDepartmentDetail(email, name, "daily"))),
        Promise.all(monthlyConfig.departments.map((name) => getDepartmentDetail(email, name, "monthly"))),
      ]);
      ceoDashboard = {
        daily: {
          departments: dailyDetails.map((r) => r.department),
          availableToAdd: FLOW_DEPARTMENTS.filter((d) => !dailyConfig.departments.includes(d)),
          actions: ceoDailyActions,
        },
        monthly: {
          departments: monthlyDetails.map((r) => r.department),
          availableToAdd: FLOW_DEPARTMENTS.filter((d) => !monthlyConfig.departments.includes(d)),
          actions: ceoMonthlyActions,
        },
      };
    }

    // HOD only: their own board's cards + columns.
    let hodKanban: Parameters<typeof TaskManagerView>[0]["hodKanban"];
    if (daily.me.me.role === "HOD") {
      const { cards, columns } = await getHodKanban(email);
      hodKanban = { cards, columns, actions: hodKanbanActions };
    }

    // HOD/DEPT_SITE inline Details: the same Daily date filter as the
    // dropdown overviews ("everywhere this layout appears" — 2026-07-25).
    // Only their own-department Daily section follows the selected date;
    // personal cards and Monthly stay on today/current month.
    let departmentDaily: Parameters<typeof TaskManagerView>[0]["departmentDaily"];
    let departmentDailyControl: ReactNode | undefined;
    if (daily.kind === "department" && daily.department) {
      const detail = await getDepartmentDetail(email, daily.department.name, "daily", dailyDate);
      departmentDaily = detail.department;
      departmentDailyControl = (
        <DailyDatePicker
          key="dept-daily-picker"
          value={detail.date}
          basePath="/task-manager"
          extraParams={monthlyCarry}
        />
      );
    }

    // Personal date filters (2026-07-28): one control per period, mounted by
    // the view on BOTH that period's personal surfaces (donut card + "My
    // Tasks" heading) — a single ?date=/?mdate= selection drives donut and
    // list together. Each carries the other's param so the two selections
    // never reset each other. Not for the CEO (un-windowed combined list).
    const personalDailyControl = (
      <DailyDatePicker
        key="personal-daily-picker"
        value={daily.date}
        basePath="/task-manager"
        extraParams={monthlyCarry}
      />
    );
    // Monthly selector (2026-07-29 redesign — calendar picker removed):
    // compact [Month ▾][Range ▾] pair for the donut card heading; the
    // range dropdown alone for the "My Tasks — Monthly" heading (its month
    // lives in the sidebar); the 12-month sidebar beside that list. All
    // drive the shared ?mdate=/?mrange= — changing month resets to Full
    // month.
    const personalMonthlyControl = (
      <div key="personal-monthly-controls" className="flex items-center gap-1.5">
        <MonthDropdown value={monthly.date} basePath="/task-manager" extraParams={dailyCarry} />
        <MonthRangeDropdown
          value={monthly.date}
          range={monthlyRangeParam}
          basePath="/task-manager"
          extraParams={dailyCarry}
        />
      </div>
    );
    const personalMonthlyRangeControl = (
      <MonthRangeDropdown
        key="personal-monthly-range"
        value={monthly.date}
        range={monthlyRangeParam}
        basePath="/task-manager"
        extraParams={dailyCarry}
      />
    );
    const personalMonthlySidebar = (
      <MonthSidebar
        key="personal-month-sidebar"
        value={monthly.date}
        basePath="/task-manager"
        extraParams={dailyCarry}
      />
    );
    // Tue–Sat weekday sidebar for "My Tasks — Daily" (2026-07-28 redesign):
    // the date picker is the MASTER (any specific occurrence, past/future);
    // the sidebar switches days WITHIN the anchored week via the same
    // shared ?date= — donut, sidebar highlight, and list always agree.
    const personalDailyDaySidebar = (
      <WeekdaySidebar
        key="daily-day-sidebar"
        value={daily.date}
        basePath="/task-manager"
        extraParams={monthlyCarry}
      />
    );

    body = (
      <TaskManagerView
        daily={daily}
        monthly={monthly}
        period={period}
        dailyHref={href("daily")}
        monthlyHref={href("monthly")}
        assignAction={assign}
        completeTaskAction={completeTask}
        skipTaskAction={skipTask}
        reopenTaskAction={reopenTask}
        reassign={reassign}
        manpowerScheduleHref="/task-manager/manpower-schedule"
        ceoDashboard={ceoDashboard}
        staff={staff}
        hodKanban={hodKanban}
        departmentDaily={departmentDaily}
        departmentDailyControl={departmentDailyControl}
        personalDailyControl={personalDailyControl}
        personalMonthlyControl={personalMonthlyControl}
        personalMonthlyRangeControl={personalMonthlyRangeControl}
        personalMonthlySidebar={personalMonthlySidebar}
        personalDailyDaySidebar={personalDailyDaySidebar}
      />
    );
  } catch (err) {
    if (err instanceof SetupPendingError) {
      body = <SetupPendingCard />;
    } else if (err instanceof NoAccountError) {
      body = <NoAccountCard email={email} />;
    } else {
      body = (
        <TaskManagerErrorCard
          message={err instanceof FlowBridgeError ? err.message : "Unexpected error"}
        />
      );
    }
  }

  return (
    <AppShell email={email} role={su.role} name={su.name}>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Task Manager</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your tasks, team status, and assignments — daily and monthly.
          </p>
        </div>
        {body}
      </div>
    </AppShell>
  );
}
