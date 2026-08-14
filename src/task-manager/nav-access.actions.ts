"use server";

// Task Manager sidebar visibility (2026-08-07) — a SEPARATE, additive
// mechanism from the portal's own NavAccess/getNavAccess (see
// src/app/components/navAccess.actions.ts) — that system is the portal's
// unrelated RBAC (feature keys/privileged), resolved against the portal's
// own database and computed for every portal user regardless of whether
// they use Task Manager at all. This one is scoped to Task Manager's own
// database/role system and fetched the same way (once per browser
// session, cached client-side) so it doesn't add a round trip to every
// route change, but it's kept as its own file/action rather than folded
// into getNavAccess to avoid coupling two unrelated identity systems.
import { auth } from "@/auth";
import { NoAccountError, requireUserByEmail } from "./data/core";
import { taskManagerNavAccess } from "./role-views";

export interface TaskManagerNavAccess {
  template: boolean;
  package: boolean;
  packageTable: boolean;
  myWeek: boolean;
}

const NO_ACCESS: TaskManagerNavAccess = {
  template: false,
  package: false,
  packageTable: false,
  myWeek: false,
};

/** Fail-closed: any error (no Task Manager account, DB not configured,
 *  etc.) hides all gated sidebar items rather than leaking access
 *  or throwing and breaking the whole sidebar. `NoAccountError` is the
 *  expected/normal case (most portal users have no Task Manager row) and
 *  stays silent; anything else (DB not configured, a real bug, etc.) is
 *  logged so an actual infra problem doesn't go invisible behind the same
 *  fail-closed return value. */
export async function getTaskManagerNavAccess(): Promise<TaskManagerNavAccess> {
  const session = await auth();
  if (!session?.user?.email) return NO_ACCESS;
  try {
    const user = await requireUserByEmail(session.user.email);
    return taskManagerNavAccess(user);
  } catch (err) {
    if (!(err instanceof NoAccountError)) {
      console.error("[task-manager] getTaskManagerNavAccess", err);
    }
    return NO_ACCESS;
  }
}
