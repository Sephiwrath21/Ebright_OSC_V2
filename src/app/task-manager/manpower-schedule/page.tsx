// /task-manager/manpower-schedule — the branch staffing grid: editable for
// the branch manager who owns the branch, read-only for anyone else on it.
// Linked from the Task Manager page's Details section.
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import AppShell from "@/app/components/AppShell";
import {
  addScheduleColumn,
  addScheduleRow,
  assignScheduleCell,
  createManpowerSchedule,
  deleteScheduleColumn,
  deleteScheduleRow,
  getFlowStaff,
  getManpowerSchedule,
  publishSchedule,
  renameScheduleRow,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { ManpowerScheduleGrid } from "@/task-manager/ui/manpower-schedule-grid";
import type { ActionResult } from "@/task-manager/ui/types";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";

export const dynamic = "force-dynamic";

// Expected errors are RETURNED, never thrown: Next.js masks thrown
// server-action error messages in production, so every action below catches
// and maps to { ok:false, message } instead of letting the framework
// swallow it. revalidatePath only runs on the success path.
const FALLBACK_MESSAGE = "Something went wrong — please try again";

function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

export default async function ManpowerSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayLocal();
  const hrefFor = (d: string) => `/task-manager/manpower-schedule?date=${d}`;

  async function createSchedule(): Promise<ActionResult> {
    "use server";
    try {
      await createManpowerSchedule(email, date);
      revalidatePath("/task-manager/manpower-schedule");
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE,
      };
    }
  }

  async function assignCell(
    slotId: string,
    assignedStaffId: string | null,
  ): Promise<ActionResult> {
    "use server";
    try {
      await assignScheduleCell(email, slotId, assignedStaffId);
      revalidatePath("/task-manager/manpower-schedule");
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE,
      };
    }
  }

  let body: ReactNode;
  try {
    const [{ schedule, canEdit }, { staff }] = await Promise.all([
      getManpowerSchedule(email, date),
      getFlowStaff(),
    ]);
    const branchStaff = schedule ? staff.filter((s) => s.branch === schedule.branch) : staff;

    // The six actions below close over this request's already-fetched
    // schedule id instead of re-fetching the whole grid on every mutation;
    // the null-guard is pure defense-in-depth since the grid only renders
    // these controls once a schedule exists.
    const scheduleId = schedule?.id;

    async function addRow(startTime: string, endTime: string): Promise<ActionResult> {
      "use server";
      try {
        if (!scheduleId) {
          return { ok: false, message: "No schedule exists for this date yet — create it first" };
        }
        await addScheduleRow(email, scheduleId, startTime, endTime);
        revalidatePath("/task-manager/manpower-schedule");
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE,
        };
      }
    }

    async function renameRow(
      oldStartTime: string,
      oldEndTime: string,
      newStartTime: string,
      newEndTime: string,
    ): Promise<ActionResult> {
      "use server";
      try {
        if (!scheduleId) {
          return { ok: false, message: "No schedule exists for this date yet — create it first" };
        }
        await renameScheduleRow(
          email,
          scheduleId,
          oldStartTime,
          oldEndTime,
          newStartTime,
          newEndTime,
        );
        revalidatePath("/task-manager/manpower-schedule");
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE,
        };
      }
    }

    async function deleteRow(startTime: string, endTime: string): Promise<ActionResult> {
      "use server";
      try {
        if (!scheduleId) {
          return { ok: false, message: "No schedule exists for this date yet — create it first" };
        }
        await deleteScheduleRow(email, scheduleId, startTime, endTime);
        revalidatePath("/task-manager/manpower-schedule");
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE,
        };
      }
    }

    async function addColumn(kind: "Coach" | "Exec"): Promise<ActionResult> {
      "use server";
      try {
        if (!scheduleId) {
          return { ok: false, message: "No schedule exists for this date yet — create it first" };
        }
        await addScheduleColumn(email, scheduleId, kind);
        revalidatePath("/task-manager/manpower-schedule");
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE,
        };
      }
    }

    async function deleteColumn(roleColumn: string): Promise<ActionResult> {
      "use server";
      try {
        if (!scheduleId) {
          return { ok: false, message: "No schedule exists for this date yet — create it first" };
        }
        await deleteScheduleColumn(email, scheduleId, roleColumn);
        revalidatePath("/task-manager/manpower-schedule");
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE,
        };
      }
    }

    async function publish(): Promise<ActionResult> {
      "use server";
      try {
        if (!scheduleId) {
          return { ok: false, message: "No schedule exists for this date yet — create it first" };
        }
        await publishSchedule(email, scheduleId);
        revalidatePath("/task-manager/manpower-schedule");
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE,
        };
      }
    }

    body = (
      <ManpowerScheduleGrid
        schedule={schedule}
        canEdit={canEdit}
        staff={branchStaff}
        actions={{
          createSchedule,
          addRow,
          renameRow,
          deleteRow,
          addColumn,
          deleteColumn,
          assignCell,
          publish,
        }}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Manpower Schedule</h1>
            <p className="mt-1 text-sm text-gray-500">
              Plan the day&apos;s staffing grid — assignments sync to each coach&apos;s task list on
              publish.
            </p>
          </div>
          <Link
            href="/task-manager"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            ← Task Manager
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <a
            href={hrefFor(shiftDate(date, -1))}
            className="font-medium text-blue-600 hover:text-blue-700"
          >
            ← Prev day
          </a>
          <span className="font-semibold text-gray-700">{date}</span>
          <a
            href={hrefFor(shiftDate(date, 1))}
            className="font-medium text-blue-600 hover:text-blue-700"
          >
            Next day →
          </a>
        </div>
        {body}
      </div>
    </AppShell>
  );
}
