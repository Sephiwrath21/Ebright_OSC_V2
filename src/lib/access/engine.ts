import "server-only";
import { prisma } from "@/lib/prisma";
import {
  type PermAction,
  type Scope,
  SCOPE_RANK,
  isCeilingLocked,
  subtypeFor,
} from "./types";

// Who is asking, resolved from their account + active employment.
export type AccessActor = {
  userId: number;
  roleId: number;
  roleType: string; // lower-cased
  subtype: string; // department_code | position | ""
  branchId: number | null;
  branchCode: string | null; // portal branch_code (join key to CRM branches)
  region: string | null; // A/B/C
  departmentId: number | null;
};

// Translate a scope into a concrete data constraint the caller applies to its
// own query (each table names its columns differently).
export type ScopeConstraint =
  | { kind: "none" } // no access at all
  | { kind: "global" } // all rows
  | { kind: "region"; region: string | null }
  | { kind: "branch"; branchId: number | null }
  | { kind: "department"; departmentId: number | null }
  | { kind: "own"; userId: number };

type Grant = { allowed: boolean; scope: Scope };
type GrantMap = Record<string, Partial<Record<PermAction, Grant>>>;

export class Access {
  constructor(
    readonly actor: AccessActor,
    private readonly grants: GrantMap,
  ) {}

  private get isSuper() {
    return this.actor.roleType === "superadmin";
  }
  private get isCeo() {
    return this.actor.roleType === "ceo";
  }

  /** Can this actor perform `action` on `feature` at all? */
  can(feature: string, action: PermAction): boolean {
    // Ceiling first: superadmin-only actions are never granted to anyone else.
    if (isCeilingLocked(feature, action)) return this.isSuper;
    if (this.isSuper) return true;
    if (this.isCeo) return action === "view"; // CEO views everything
    return this.grants[feature]?.[action]?.allowed ?? false;
  }

  /** The effective scope for an allowed (feature, action), else null. */
  scope(feature: string, action: PermAction): Scope | null {
    if (!this.can(feature, action)) return null;
    if (this.isSuper || this.isCeo) return "global";
    return this.grants[feature]?.[action]?.scope ?? null;
  }

  /** The concrete data constraint to filter queries by. */
  constraint(feature: string, action: PermAction): ScopeConstraint {
    const s = this.scope(feature, action);
    if (s === null) return { kind: "none" };
    switch (s) {
      case "global":
        return { kind: "global" };
      case "region":
        return { kind: "region", region: this.actor.region };
      case "branch":
        return { kind: "branch", branchId: this.actor.branchId };
      case "own":
        return { kind: "own", userId: this.actor.userId };
      case "team":
        // team = the actor's grouping: HODs → their department, branch-side
        // roles → their branch.
        if (this.actor.roleType === "hod") {
          return { kind: "department", departmentId: this.actor.departmentId };
        }
        return { kind: "branch", branchId: this.actor.branchId };
    }
  }
}

/** Load an actor from a user id or email. Returns null if the user is unknown. */
export async function loadActor(
  userIdOrEmail: number | string,
): Promise<AccessActor | null> {
  const where =
    typeof userIdOrEmail === "number"
      ? { user_id: userIdOrEmail }
      : { email: userIdOrEmail };

  const u = await prisma.users.findUnique({
    where,
    select: {
      user_id: true,
      role: { select: { role_id: true, role_type: true } },
      employment: {
        orderBy: { start_date: "desc" },
        take: 1,
        select: {
          position: true,
          branch: { select: { branch_id: true, branch_code: true, region: true } },
          department: { select: { department_id: true, department_code: true } },
        },
      },
    },
  });
  if (!u) return null;

  const emp = u.employment[0];
  const roleType = u.role.role_type.toLowerCase();
  const departmentCode = emp?.department?.department_code ?? null;
  const position = emp?.position ?? null;

  return {
    userId: u.user_id,
    roleId: u.role.role_id,
    roleType,
    subtype: subtypeFor(roleType, departmentCode, position),
    branchId: emp?.branch?.branch_id ?? null,
    branchCode: emp?.branch?.branch_code ?? null,
    region: emp?.branch?.region ?? null,
    departmentId: emp?.department?.department_id ?? null,
  };
}

/**
 * Build the full Access object for an actor: fetches every role_permission row
 * for their (role, subtype ∈ {"", actor.subtype}) once, so can()/scope() are
 * synchronous afterwards. superadmin/ceo need no rows (handled in Access).
 */
export async function buildAccess(
  actorOrId: AccessActor | number | string,
): Promise<Access | null> {
  const actor =
    typeof actorOrId === "object" ? actorOrId : await loadActor(actorOrId);
  if (!actor) return null;

  const grants: GrantMap = {};
  if (actor.roleType !== "superadmin" && actor.roleType !== "ceo") {
    const subtypes = actor.subtype ? ["", actor.subtype] : [""];
    const rows = await prisma.role_permission.findMany({
      where: { role_id: actor.roleId, subtype: { in: subtypes }, allowed: true },
      select: { feature_key: true, action: true, scope: true },
    });
    for (const r of rows) {
      const action = r.action as PermAction;
      const scope = r.scope as Scope;
      const fk = (grants[r.feature_key] ??= {});
      const existing = fk[action];
      // Most-permissive scope wins when "" baseline and a sub-type row overlap.
      if (!existing || SCOPE_RANK[scope] > SCOPE_RANK[existing.scope]) {
        fk[action] = { allowed: true, scope };
      }
    }
  }

  return new Access(actor, grants);
}
