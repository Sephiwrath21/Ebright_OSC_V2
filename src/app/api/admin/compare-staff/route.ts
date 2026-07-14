import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["superadmin", "ceo", "hr"]);

// Diff between HRFS BranchStaff (source) and local employment+user_profile.
// Returns 4 buckets:
//   - inHrfsOnly         : on BranchStaff, not in local
//   - inLocalOnly        : in local employment.employee_id, not on BranchStaff
//   - nameMismatch       : matched by employeeId, names differ
//   - branchMismatch     : matched, branches differ
// Safe (read-only) — no inserts/updates. Use the result to drive a manual
// reconciliation (or build a follow-up auto-fill endpoint).
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  const roleType = me?.role?.role_type?.toLowerCase() ?? "";
  if (!ALLOWED_ROLES.has(roleType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hrfs = await queryEbrightHrfs<{
    employee_id: string | null;
    name: string | null;
    branch: string | null;
    status: string | null;
  }>(
    `SELECT "employeeId" AS employee_id, name, branch, status
       FROM public."BranchStaff"
      WHERE "employeeId" IS NOT NULL`,
  );

  const local = await prisma.employment.findMany({
    where: { employee_id: { not: null } },
    select: {
      employment_id: true,
      employee_id: true,
      status: true,
      branch: { select: { branch_code: true } },
      users: {
        select: {
          user_id: true,
          status: true,
          user_profile: { select: { full_name: true } },
        },
      },
    },
  });

  const hrfsByCode = new Map<string, (typeof hrfs.rows)[number]>();
  for (const r of hrfs.rows) if (r.employee_id) hrfsByCode.set(r.employee_id, r);

  const localByCode = new Map<string, (typeof local)[number]>();
  for (const r of local) if (r.employee_id) localByCode.set(r.employee_id, r);

  const inHrfsOnly: Array<{ employee_id: string; name: string | null; branch: string | null; status: string | null }> = [];
  const inLocalOnly: Array<{ employee_id: string; name: string | null; branch: string | null; status: string | null }> = [];
  const nameMismatch: Array<{ employee_id: string; hrfs_name: string | null; local_name: string | null }> = [];
  const branchMismatch: Array<{ employee_id: string; hrfs_branch: string | null; local_branch: string | null }> = [];

  for (const [code, h] of hrfsByCode) {
    const l = localByCode.get(code);
    if (!l) {
      inHrfsOnly.push({
        employee_id: code,
        name: h.name,
        branch: h.branch,
        status: h.status,
      });
      continue;
    }
    const localName = l.users.user_profile?.full_name ?? null;
    if ((h.name ?? "").trim() !== (localName ?? "").trim()) {
      nameMismatch.push({
        employee_id: code,
        hrfs_name: h.name,
        local_name: localName,
      });
    }
    const localBranch = l.branch?.branch_code ?? null;
    if ((h.branch ?? "") !== (localBranch ?? "")) {
      branchMismatch.push({
        employee_id: code,
        hrfs_branch: h.branch,
        local_branch: localBranch,
      });
    }
  }
  for (const [code, l] of localByCode) {
    if (!hrfsByCode.has(code)) {
      inLocalOnly.push({
        employee_id: code,
        name: l.users.user_profile?.full_name ?? null,
        branch: l.branch?.branch_code ?? null,
        status: l.status,
      });
    }
  }

  return NextResponse.json({
    counts: {
      hrfsTotal: hrfsByCode.size,
      localTotal: localByCode.size,
      inHrfsOnly: inHrfsOnly.length,
      inLocalOnly: inLocalOnly.length,
      nameMismatch: nameMismatch.length,
      branchMismatch: branchMismatch.length,
    },
    inHrfsOnly,
    inLocalOnly,
    nameMismatch,
    branchMismatch,
  });
}
