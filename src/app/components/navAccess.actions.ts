"use server";

import { auth } from "@/auth";
import { buildAccess } from "@/lib/access/engine";
import { FEATURE_KEYS } from "@/lib/access/types";
import type { NavAccess } from "./navAccess.types";

export async function getNavAccess(): Promise<NavAccess> {
  const session = await auth();
  if (!session?.user?.email) return { privileged: false, features: [] };

  const access = await buildAccess(session.user.email);
  if (!access) return { privileged: false, features: [] };

  const roleType = access.actor.roleType;
  const privileged = roleType === "superadmin" || roleType === "ceo";

  // superadmin/ceo view everything; others get exactly what their grants allow.
  const features = FEATURE_KEYS.filter((k) => access.can(k, "view"));

  return { privileged, features };
}
