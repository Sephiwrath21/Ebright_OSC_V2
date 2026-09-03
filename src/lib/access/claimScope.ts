import "server-only";
import type { Prisma } from "@prisma/client";
import type { Access } from "./engine";

// `claim` has no branch/department column — scope filters go through the owning
// user's latest employment. We use a `some` relation filter; for the rare user
// with multiple employment rows this is slightly looser than "latest only",
// which is acceptable for a read filter.

const MATCH_NONE: Prisma.claimWhereInput = { claim_id: -1 };

/**
 * The Prisma `where` for the claim list, honouring the actor's view scope.
 * For `team` scope the caller passes `teamView` (the own↔team toggle): false =
 * only their own claims, true = their branch/department members' claims.
 */
export function claimListWhere(
  access: Access,
  teamView: boolean,
): Prisma.claimWhereInput {
  const scope = access.scope("claim", "view");
  const a = access.actor;
  if (scope === null) return MATCH_NONE;

  // team + toggle off → just their own
  if (scope === "team" && !teamView) return { user_id: a.userId };

  const c = access.constraint("claim", "view");
  switch (c.kind) {
    case "global":
      return {};
    case "own":
      return { user_id: a.userId };
    case "branch":
      return c.branchId == null
        ? MATCH_NONE
        : { users: { employment: { some: { branch_id: c.branchId } } } };
    case "department":
      return c.departmentId == null
        ? MATCH_NONE
        : { users: { employment: { some: { department_id: c.departmentId } } } };
    case "region":
      return c.region == null
        ? MATCH_NONE
        : { users: { employment: { some: { branch: { region: c.region } } } } };
    case "none":
      return MATCH_NONE;
  }
}

/** Whether the actor may view a single claim owned by the given user/employment. */
export function canViewClaimRecord(
  access: Access,
  owner: { userId: number; branchId: number | null; departmentId: number | null },
): boolean {
  const a = access.actor;
  if (owner.userId === a.userId) return true; // always see your own
  const c = access.constraint("claim", "view");
  switch (c.kind) {
    case "global":
      return true;
    case "own":
      return false;
    case "branch":
      return owner.branchId != null && owner.branchId === c.branchId;
    case "department":
      return owner.departmentId != null && owner.departmentId === c.departmentId;
    case "region":
      return false; // region needs the owner's branch region; not needed for claim today
    case "none":
      return false;
  }
}
