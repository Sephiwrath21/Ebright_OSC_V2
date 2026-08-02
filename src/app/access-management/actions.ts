"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { PermAction, Scope } from "@/lib/access/types";

export type MatrixGrant = {
  feature_key: string;
  action: PermAction;
  scope: Scope;
};

export type LoadMatrixResult =
  | { ok: true; grants: MatrixGrant[] }
  | { ok: false; error: string };

export type SaveMatrixResult = { ok: boolean; error?: string };

const VIEW_ROLE_TYPES = new Set(["superadmin", "ceo"]);

async function requireRole(edit: boolean): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: "Not authenticated." };
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  const rt = me?.role?.role_type?.toLowerCase() ?? "";
  if (edit) {
    // Only superadmin may change the permission matrix.
    if (rt !== "superadmin")
      return { ok: false, error: "Only superadmin can edit permissions." };
  } else if (!VIEW_ROLE_TYPES.has(rt)) {
    return { ok: false, error: "You don't have access to permissions." };
  }
  return { ok: true };
}

/** All allowed grants for one (role, subtype). Absent = not allowed. */
export async function loadMatrix(
  roleId: number,
  subtype: string,
): Promise<LoadMatrixResult> {
  const guard = await requireRole(false);
  if (!guard.ok) return { ok: false, error: guard.error };

  try {
    const rows = await prisma.role_permission.findMany({
      where: { role_id: roleId, subtype, allowed: true },
      select: { feature_key: true, action: true, scope: true },
    });
    return {
      ok: true,
      grants: rows.map((r) => ({
        feature_key: r.feature_key,
        action: r.action as PermAction,
        scope: r.scope as Scope,
      })),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not load permissions: ${msg}` };
  }
}

/**
 * Replace the entire grant set for one (role, subtype). `grants` is the desired
 * allowed rows; anything not listed becomes not-allowed. Full-replace keeps the
 * table clean (no stale allowed=false rows).
 */
export async function saveMatrix(
  roleId: number,
  subtype: string,
  grants: MatrixGrant[],
): Promise<SaveMatrixResult> {
  const guard = await requireRole(true);
  if (!guard.ok) return { ok: false, error: guard.error };

  // superadmin/ceo are implicit in code — never store rows for them.
  const role = await prisma.role.findUnique({
    where: { role_id: roleId },
    select: { role_type: true },
  });
  const rt = role?.role_type?.toLowerCase() ?? "";
  if (rt === "superadmin" || rt === "ceo") {
    return {
      ok: false,
      error: `${rt} permissions are fixed and not editable.`,
    };
  }

  try {
    await prisma.$transaction([
      prisma.role_permission.deleteMany({
        where: { role_id: roleId, subtype },
      }),
      prisma.role_permission.createMany({
        data: grants.map((g) => ({
          role_id: roleId,
          subtype,
          feature_key: g.feature_key,
          action: g.action,
          scope: g.scope,
          allowed: true,
        })),
      }),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not save permissions: ${msg}` };
  }

  return { ok: true };
}
