// /task-manager — the role-scoped Task Manager view (replaces the old
// ClickUp Tasks feature). Wiring mirrors the donor's osc-demo page: this
// server component fetches all payloads, defines the server actions (each
// closing over the session email), and passes both down as props — the
// client components never fetch and never see an identity primitive.
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import AppShell from "@/app/components/AppShell";
import {
  assignFlowTask,
  completeFlowTask,
  createKanbanCard,
  createKanbanColumn,
  deleteKanbanCard,
  deleteKanbanColumn,
  getCeoDashboardConfig,
  getDepartmentDetail,
  getFlowDetail,
  getFlowStaff,
  getHodKanban,
  moveKanbanCard,
  moveKanbanColumn,
  recolorKanbanColumn,
  renameKanbanColumn,
  reopenFlowTask,
  saveCeoDashboardConfig,
  skipFlowTask,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { TaskManagerView } from "@/task-manager/ui/task-manager-view";
import {
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

export default async function TaskManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  const sp = await searchParams;
  const period = sp.period === "monthly" ? "monthly" : "daily";
  const href = (p: string) => `/task-manager?period=${p}`;

  // Expected errors are RETURNED, never thrown: Next.js masks thrown
  // server-action error messages in production, so every action here catches
  // and maps to { ok:false, message } instead of letting the framework
  // swallow it. revalidatePath only runs on the success path.
  const FALLBACK_MESSAGE = "Something went wrong — please try again";

  async function assign(input: FlowAssignInput): Promise<AssignActionResult> {
    "use server";
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
    try {
      await reopenFlowTask(email, runBlockId);
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
  try {
    const [daily, monthly, { staff }] = await Promise.all([
      getFlowDetail(email, "daily"),
      getFlowDetail(email, "monthly"),
      getFlowStaff(),
    ]);

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
        manpowerScheduleHref="/task-manager/manpower-schedule"
        departmentOverviewHref="/task-manager/department-overview"
        ceoDashboard={ceoDashboard}
        staff={staff}
        hodKanban={hodKanban}
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
