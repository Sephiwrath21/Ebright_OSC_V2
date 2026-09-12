"use server";

import { auth } from "@/auth";
import { buildAccess } from "@/lib/access/engine";
import { FEATURE_KEYS } from "@/lib/access/types";
import { resolveTaskOverviewAccess } from "@/lib/pendingOverdueTasksAccess";
import { canAccessClickUpTask } from "@/lib/departments";
import type { NavAccess } from "./navAccess.types";

export async function getNavAccess(): Promise<NavAccess> {
  const session = await auth();
  if (!session?.user?.email) return { privileged: false, features: [], pendingOverdueTasksAccess: false, clickUpTaskAccess: false };

  const access = await buildAccess(session.user.email);
  if (!access) return { privileged: false, features: [], pendingOverdueTasksAccess: false, clickUpTaskAccess: false };

  const roleType = access.actor.roleType;
  const privileged = roleType === "superadmin" || roleType === "ceo";

  // superadmin/ceo view everything; others get exactly what their grants allow.
  const features = FEATURE_KEYS.filter((k) => access.can(k, "view"));

  // Same resolver the route itself uses server-side — this call only
  // decides the sidebar link's visibility (see NavAccess's own comment).
  const taskOverviewAccess = await resolveTaskOverviewAccess(session.user.email);

  return {
    privileged,
    features,
    pendingOverdueTasksAccess: taskOverviewAccess.kind !== "denied",
    // Resolved from the DB role_type (not the JWT), but the same predicate the
    // /clickup-task routes check against session role — see canAccessClickUpTask.
    clickUpTaskAccess: canAccessClickUpTask(roleType),
  };
}
