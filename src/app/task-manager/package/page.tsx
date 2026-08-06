// /task-manager/package — Package dashboard (2026-08-06): a second
// instance of the Template Groups feature (see
// task-manager/data/template-groups.ts), scoped to "PACKAGE" and
// restricted to Branch Manager only. Wiring mirrors
// /task-manager/template/page.tsx closely — same six "use server" action
// closures, same three-way SetupPendingError/NoAccountError/generic-error
// card handling, same 403-redirect pattern — just bound to scope: "PACKAGE"
// throughout and labeled "Package" in the UI. Unlike Template's page, this
// one has no CEO-hideCadence concern (Branch Managers are never CEOs), so
// there's no getMyRole call here.
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
const SCOPE = "PACKAGE" as const;

export default async function TaskManagerPackagePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  let groups;
  let staff;
  try {
    const [groupsResult, staffResult] = await Promise.all([
      listTemplateGroups(email, SCOPE),
      getFlowStaff(),
    ]);
    groups = groupsResult;
    staff = staffResult.staff;
  } catch (err) {
    // Genuine "not a branch manager" (403) bounces to /task-manager —
    // everything else renders in place, same as /task-manager/template.
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
      const group = await getTemplateGroup(email, groupId, SCOPE);
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
      const result = await createTemplateGroup(email, SCOPE, input);
      revalidatePath("/task-manager/package");
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
      const result = await editTemplateGroup(email, groupId, SCOPE, input);
      revalidatePath("/task-manager/package");
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
      const impact = await getGroupDeletionImpact(email, groupId, SCOPE);
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
      const result = await deleteTemplateGroup(email, groupId, SCOPE);
      revalidatePath("/task-manager/package");
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
      const result = await applyTemplateGroup(email, groupId, SCOPE, input);
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
      const assignees = await getGroupAssignees(email, groupId, SCOPE);
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
      const result = await removeGroupAssignee(email, groupId, SCOPE, userId);
      revalidatePath("/task-manager");
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  return (
    <AppShell email={su.email} role={su.role} name={su.name}>
      <div className="mx-auto max-w-[1400px] p-6">
        <h1 className="text-2xl font-bold text-gray-900">Package</h1>
        <p className="mt-1 text-sm text-gray-500">Reusable multi-task packages — create once, assign whenever.</p>
        <div className="mt-6">
          <TemplateGroupDashboard
            staff={staff}
            label="Package"
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
