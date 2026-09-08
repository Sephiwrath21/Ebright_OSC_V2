import { type Access, buildAccess } from "@/lib/access/engine";
import {
  type ClaimTaskGate,
  getOpenTasksForClaim,
} from "@/task-manager/data/claim-gate";

/**
 * Should the claim pages refuse to open for this person right now?
 *
 * Returns the gate when they still have an open (not DONE/SKIPPED) Task
 * Manager task in the current month, else null. A claim date can only ever be
 * today..end-of-month (submitClaim enforces that), so "now" resolves to the
 * month any claim started here would belong to.
 *
 * REVIEWERS ARE EXEMPT. /claim is not only where a claim is made, it is also
 * the approvals queue — `claim:update` is Finance/HR/superadmin. Gating them
 * would halt every approval in the company the moment an approver had a task
 * of their own outstanding, which is not what "you can't claim until your
 * tasks are done" asks for. Drop the `access?.can(...)` line to gate everyone.
 *
 * Fails open exactly as getOpenTasksForClaim does: no Task Manager account,
 * no TASK_MANAGER_DATABASE_URL, or a database error all mean "not blocked".
 *
 * `known` lets a caller that already built the actor's Access pass it in
 * rather than pay for a second lookup on the same request.
 */
export async function claimTaskBlock(
  email: string,
  known?: Access | null,
): Promise<ClaimTaskGate | null> {
  const access = known !== undefined ? known : await buildAccess(email);
  if (access?.can("claim", "update")) return null;

  const gate = await getOpenTasksForClaim(
    { email, hrfsUserId: access?.actor.userId ?? null },
    new Date(),
  );
  return gate.blocked ? gate : null;
}
