import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canReviewClaims } from "@/app/claim/roles";

export const dynamic = "force-dynamic";

const APPROVED_ONWARD = new Set(["approved", "disbursed", "received"]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role_id: true, email: true, role: { select: { role_type: true } } },
  });
  if (
    !me ||
    !canReviewClaims({
      role_id: me.role_id,
      email: me.email,
      role_type: me.role?.role_type ?? null,
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const claims = await prisma.claim.findMany({
    orderBy: { submitted_on: "desc" },
    include: {
      users: {
        select: { email: true, user_profile: { select: { full_name: true } } },
      },
    },
  });
  type ClaimRecord = (typeof claims)[number];

  const counts = {
    total: claims.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    disbursed: 0,
    received: 0,
  };
  let approvedAmount = 0;
  let pendingAmount = 0;
  const byMonth = new Map<string, { count: number; amount: number }>();
  const byType = new Map<string, { count: number; amount: number }>();

  for (const c of claims) {
    if (c.status in counts) {
      (counts as Record<string, number>)[c.status] += 1;
    }
    const amt = Number(c.amount);
    if (c.status === "pending") pendingAmount += amt;

    const ym = c.claim_date.toISOString().slice(0, 7);
    const m = byMonth.get(ym) ?? { count: 0, amount: 0 };
    m.count += 1;
    m.amount += amt;
    byMonth.set(ym, m);

    if (APPROVED_ONWARD.has(c.status)) {
      const eff = Number(c.approved_amount ?? c.amount);
      approvedAmount += eff;
      const t = byType.get(c.claim_type) ?? { count: 0, amount: 0 };
      t.count += 1;
      t.amount += eff;
      byType.set(c.claim_type, t);
    }
  }

  // Headcount — active employees grouped by department and branch.
  const employments = await prisma.employment.findMany({
    where: { status: "active" },
    orderBy: { employment_id: "desc" },
    select: {
      user_id: true,
      branch: { select: { branch_code: true, branch_name: true } },
      department: { select: { department_code: true, department_name: true } },
    },
  });

  const seenUsers = new Set<number>();
  const branchHead = new Map<string, { label: string; count: number }>();
  const deptHead = new Map<string, { label: string; count: number }>();
  for (const e of employments) {
    if (seenUsers.has(e.user_id)) continue; // one active record per employee
    seenUsers.add(e.user_id);
    if (e.branch?.branch_name) {
      const code = e.branch.branch_code ?? "";
      const key = code || e.branch.branch_name;
      const label = code ? `${code} - ${e.branch.branch_name}` : e.branch.branch_name;
      const cur = branchHead.get(key) ?? { label, count: 0 };
      cur.count += 1;
      branchHead.set(key, cur);
    }
    if (e.department?.department_name) {
      const code = e.department.department_code ?? "";
      const key = code || e.department.department_name;
      const label = code
        ? `${code} - ${e.department.department_name}`
        : e.department.department_name;
      const cur = deptHead.get(key) ?? { label, count: 0 };
      cur.count += 1;
      deptHead.set(key, cur);
    }
  }
  const headcountByBranch = Array.from(branchHead.values()).sort((a, b) => b.count - a.count);
  const headcountByDepartment = Array.from(deptHead.values()).sort((a, b) => b.count - a.count);

  const name = (c: ClaimRecord) => c.users.user_profile?.full_name ?? c.users.email;
  const toRow = (c: ClaimRecord) => ({
    claimId: c.claim_id,
    displayId: `CLM-${String(c.claim_id).padStart(3, "0")}`,
    employeeName: name(c),
    claimType: c.claim_type,
    amount: Number(c.amount),
    claimDate: c.claim_date.toISOString().slice(0, 10),
    status: c.status,
  });

  return NextResponse.json({
    success: true,
    counts,
    approvedAmount,
    pendingAmount,
    pending: claims.filter((c) => c.status === "pending").slice(0, 8).map(toRow),
    recent: claims.slice(0, 5).map(toRow),
    byMonth: Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, count: v.count, amount: v.amount })),
    byType: Array.from(byType.entries())
      .map(([type, v]) => ({ type, count: v.count, amount: v.amount }))
      .sort((a, b) => b.amount - a.amount),
    headcountByDepartment,
    headcountByBranch,
    totalHeadcount: seenUsers.size,
  });
}
