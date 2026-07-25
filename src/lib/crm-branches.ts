import "server-only";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Read-only branch list — sourced ENTIRELY from HRFS (Prisma), no CRM.
//
// Branches come from HRFS public.branch. Keyed by branch_id.
// The branch "account" email is the HRFS role_id=4 ("branch") account linked to
// that branch via employment.branch_id. Branches whose account/email isn't
// filled in yet come back with a blank email (the page renders them as "—"),
// and light up automatically once the link is populated in HRFS.
// ─────────────────────────────────────────────────────────────────────────────

export interface BranchRow {
  id: string;
  name: string;
  code: string | null;
  region: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;        // HRFS role_id=4 account email (via employment.branch_id)
  managerName: string | null;  // that account's name/email fragment (if any)
}

export async function getBranches(): Promise<BranchRow[] | null> {
  try {
    const branches = await prisma.branch.findMany({
      where: { branch_id: { not: 22 } }, // exclude HQ (branch_id=22)
      select: { branch_id: true, branch_name: true, branch_code: true, region: true, location: true },
      orderBy: { branch_name: "asc" },
    });

    // SINGLE SOURCE OF TRUTH: the branch's email is the email of the role_id=4
    // ("branch") account linked to it via employment.branch_id (set from the
    // account's profile → "Assigned Branch"). No email-pattern guessing — a
    // branch only shows an email once a real account is assigned to it.
    // Ordered newest-first so that if more than one role_id=4 account is linked
    // to the same branch, the most recent assignment deterministically wins.
    const emp = await prisma.employment.findMany({
      where: { branch_id: { not: null }, users: { role_id: 4 } },
      select: { branch_id: true, users: { select: { email: true } } },
      orderBy: { employment_id: "desc" },
    });
    const emailByBranchId = new Map<number, string>();
    for (const e of emp) {
      if (e.branch_id != null && e.users?.email && !emailByBranchId.has(e.branch_id)) {
        emailByBranchId.set(e.branch_id, e.users.email);
      }
    }

    return branches.map((b) => {
      const email = emailByBranchId.get(b.branch_id) ?? null;
      return {
        id: String(b.branch_id),
        name: b.branch_name,
        code: b.branch_code,
        region: b.region,
        address: b.location,
        phone: null, // HRFS branch has no phone column
        email,
        managerName: email ? email.split("@")[0] : null,
      };
    });
  } catch (e) {
    console.warn("[crm-branches] HRFS branch lookup failed:", (e as Error).message);
    return null;
  }
}
