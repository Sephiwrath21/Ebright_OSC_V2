// /task-manager/my-week — standalone "My Week" page (2026-08-13): the
// signed-in user's own tasks for the current week, tabbed by weekday.
// Wiring mirrors /task-manager/package/page.tsx closely — same "use server"
// action closures, same three-way SetupPendingError/NoAccountError/generic-
// error card handling — just no initial-load 403 redirect (getFlowDetail's
// "daily" fetch has no separate View-tier gate the way listTemplateGroups
// does). Uses getFlowOverview (not getFlowDetail) for the per-weekday
// fetches: getFlowDetail's role branches additionally pull org/department/
// branch-wide payloads this page never reads, and this page calls it once
// per weekday (up to 7x) — getFlowOverview has the same (email, period,
// date) signature but returns only the personal payload every role needs.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireLiveSession } from "@/task-manager/action-session";
import AppShell from "@/app/components/AppShell";
import { resolveViewRole, weekdayRangeOf, thisWeekDatesForRange } from "@/task-manager/role-views";
import {
  completeFlowTask,
  getFlowOverview,
  removeFlowTaskProof,
  uploadFlowTaskProof,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { MyWeekView, type MyWeekDay } from "@/task-manager/ui/my-week-view";
import { NoAccountCard, SetupPendingCard, TaskManagerErrorCard } from "@/task-manager/ui/status-cards";
import type { ActionResult, ProofRemoveResult, ProofUploadResult } from "@/task-manager/ui/types";

export const dynamic = "force-dynamic";
const FALLBACK_MESSAGE = "Something went wrong — please try again";

export default async function TaskManagerMyWeekPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  const errorPage = (err: unknown) => {
    let card;
    if (err instanceof SetupPendingError) card = <SetupPendingCard />;
    else if (err instanceof NoAccountError) card = <NoAccountCard email={email} />;
    else card = <TaskManagerErrorCard message={err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE} />;
    return (
      <AppShell email={su.email} role={su.role} name={su.name}>
        <div className="mx-auto max-w-[1400px] p-6">{card}</div>
      </AppShell>
    );
  };

  let days: MyWeekDay[];
  let myUserId: string;
  try {
    const now = new Date();
    const todayResult = await getFlowOverview(email, "daily");
    myUserId = todayResult.me.userId;
    const view = resolveViewRole(todayResult.me);
    const range = weekdayRangeOf(view);
    const weekDates = thisWeekDatesForRange(range, now);
    const todayDateStr = todayResult.date;
    const otherDates = weekDates.filter((d) => d.date !== todayDateStr);
    const otherResults = await Promise.all(otherDates.map((d) => getFlowOverview(email, "daily", d.date)));
    const resultByDate = new Map(otherResults.map((r) => [r.date, r]));
    resultByDate.set(todayDateStr, todayResult);
    days = weekDates.map((d) => ({
      weekday: d.weekday,
      date: d.date,
      tasks: resultByDate.get(d.date)?.tasks ?? [],
    }));
  } catch (err) {
    return errorPage(err);
  }

  async function completeTask(runBlockId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await completeFlowTask(email, runBlockId);
      revalidatePath("/task-manager/my-week");
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
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const { proofId } = await uploadFlowTaskProof(email, runBlockId, image);
      revalidatePath("/task-manager/my-week");
      return { ok: true, proofId };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function removeProof(proofId: string): Promise<ProofRemoveResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await removeFlowTaskProof(email, proofId);
      revalidatePath("/task-manager/my-week");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  return (
    <AppShell email={su.email} role={su.role} name={su.name}>
      <div className="mx-auto max-w-[1400px] p-6">
        <h1 className="text-2xl font-bold text-gray-900">My Tasks — Daily</h1>
        <div className="mt-6">
          <MyWeekView
            days={days}
            myUserId={myUserId}
            onComplete={completeTask}
            onUploadProof={uploadProof}
            onRemoveProof={removeProof}
          />
        </div>
      </div>
    </AppShell>
  );
}
