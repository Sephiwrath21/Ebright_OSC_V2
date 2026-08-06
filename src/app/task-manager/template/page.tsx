// /task-manager/template — Template Groups dashboard (2026-08-06): manage
// reusable multi-task templates (a named collection of several TaskTemplate
// rows — see task-manager/data/template-groups.ts). Wiring mirrors
// /task-manager's own page: server component fetches data + defines
// "use server" action closures, passes both to a client dashboard
// component. Gated by the same assign-capable allow-list as the rest of
// Task Manager — the first fetch (listTemplateGroups, via requireAssigner)
// IS the gate. Mirrors /task-manager/page.tsx's own three-way error
// handling for its first fetch: SetupPendingError -> SetupPendingCard,
// NoAccountError -> NoAccountCard, any other unexpected failure ->
// TaskManagerErrorCard with the real message. Only a genuine 403 (account
// exists but isn't assign-capable — requireAssigner's own ApiHttpError(403,
// ...), which native() re-throws as a FlowBridgeError carrying that same
// status) redirects to /task-manager instead of rendering an empty/broken
// page here.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireLiveSession } from "@/task-manager/action-session";
import AppShell from "@/app/components/AppShell";
import {
  applyTemplateGroup,
  createTemplateGroup,
  deleteTemplateGroup,
  editTemplateGroup,
  getGroupAssignees,
  getGroupDeletionImpact,
  getFlowStaff,
  getMyRole,
  getTemplateGroup,
  listTemplateGroups,
  removeGroupAssignee,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { TemplateGroupDashboard } from "@/task-manager/ui/template-group-dashboard";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";
import type {
  FlowTemplateGroupApplyInput,
  FlowTemplateGroupTaskInput,
  TemplateGroupApplyResult,
  TemplateGroupAssigneesResult,
  TemplateGroupDeleteResult,
  TemplateGroupEditResult,
  TemplateGroupImpactResult,
  TemplateGroupLoadResult,
  TemplateGroupRemoveAssigneeResult,
  TemplateGroupSaveResult,
} from "@/task-manager/ui/types";

export const dynamic = "force-dynamic";

const FALLBACK_MESSAGE = "Something went wrong — please try again";

export default async function TaskManagerTemplatePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  let groups;
  let staff;
  let role;
  try {
    const [groupsResult, staffResult, roleResult] = await Promise.all([
      listTemplateGroups(email, "TEMPLATE"),
      getFlowStaff(),
      getMyRole(email),
    ]);
    groups = groupsResult;
    staff = staffResult.staff;
    role = roleResult.role;
  } catch (err) {
    // Genuine "not assign-capable" (403) is the only case that bounces
    // elsewhere — everything else renders in place, same as /task-manager.
    if (err instanceof FlowBridgeError && err.status === 403) redirect("/task-manager");
    let card;
    if (err instanceof SetupPendingError) {
      card = <SetupPendingCard />;
    } else if (err instanceof NoAccountError) {
      card = <NoAccountCard email={email} />;
    } else {
      card = (
        <TaskManagerErrorCard message={err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE} />
      );
    }
    return (
      <AppShell email={su.email} role={su.role} name={su.name}>
        <div className="mx-auto max-w-[1400px] p-6">{card}</div>
      </AppShell>
    );
  }

  async function loadGroup(groupId: string): Promise<TemplateGroupLoadResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const group = await getTemplateGroup(email, groupId, "TEMPLATE");
      return { ok: true, group };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function createGroup(input: {
    name: string;
    tasks: { title: string; subtasks: string[] }[];
  }): Promise<TemplateGroupSaveResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await createTemplateGroup(email, "TEMPLATE", input);
      revalidatePath("/task-manager/template");
      return { ok: true, id: result.id };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function editGroup(
    groupId: string,
    input: { name: string; tasks: FlowTemplateGroupTaskInput[] },
  ): Promise<TemplateGroupEditResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await editTemplateGroup(email, groupId, "TEMPLATE", input);
      revalidatePath("/task-manager/template");
      revalidatePath("/task-manager");
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function groupImpact(groupId: string): Promise<TemplateGroupImpactResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const impact = await getGroupDeletionImpact(email, groupId, "TEMPLATE");
      return { ok: true, ...impact };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function removeGroup(groupId: string): Promise<TemplateGroupDeleteResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await deleteTemplateGroup(email, groupId, "TEMPLATE");
      revalidatePath("/task-manager/template");
      revalidatePath("/task-manager");
      return { ok: true, removedTasks: result.removedTasks, keptRecords: result.keptRecords };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function applyGroup(
    groupId: string,
    input: FlowTemplateGroupApplyInput,
  ): Promise<TemplateGroupApplyResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await applyTemplateGroup(email, groupId, "TEMPLATE", input);
      revalidatePath("/task-manager");
      return { ok: true, created: result.created };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function groupAssignees(groupId: string): Promise<TemplateGroupAssigneesResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const assignees = await getGroupAssignees(email, groupId, "TEMPLATE");
      return { ok: true, assignees };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function removeAssignee(
    groupId: string,
    userId: string,
  ): Promise<TemplateGroupRemoveAssigneeResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await removeGroupAssignee(email, groupId, "TEMPLATE", userId);
      revalidatePath("/task-manager");
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  return (
    <AppShell email={su.email} role={su.role} name={su.name}>
      <div className="mx-auto max-w-[1400px] p-6">
        <h1 className="text-2xl font-bold text-gray-900">Template</h1>
        <p className="mt-1 text-sm text-gray-500">Reusable multi-task templates — create once, assign whenever.</p>
        <div className="mt-6">
          <TemplateGroupDashboard
            staff={staff}
            hideCadence={role === "CEO"}
            control={{
              list: groups,
              load: loadGroup,
              create: createGroup,
              edit: editGroup,
              impact: groupImpact,
              remove: removeGroup,
              apply: applyGroup,
              assignees: groupAssignees,
              removeAssignee,
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
