import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import ClaimFormView from "@/app/components/ClaimFormView";
import { type ClaimType, isClaimType, canAccessClaimType } from "@/app/claim/claim-types";
import ClaimBlockedNotice from "@/app/claim/ClaimBlockedNotice";
import { claimTaskBlock } from "@/app/claim/task-gate";

export const dynamic = "force-dynamic";

async function getHealthUsedThisYear(userId: number): Promise<number> {
  const now = new Date();
  // claim_date is stored as UTC midnight (date-only form strings parse as
  // UTC), so the window must be UTC-anchored regardless of process TZ.
  const yearStart = new Date(Date.UTC(now.getFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(now.getFullYear() + 1, 0, 1));
  const res = await prisma.claim.aggregate({
    where: {
      user_id: userId,
      claim_type: "health",
      status: { in: ["approved", "disbursed", "received"] },
      claim_date: { gte: yearStart, lt: yearEnd },
    },
    _sum: { approved_amount: true },
  });
  return Number(res._sum.approved_amount ?? 0);
}

export default async function NewClaimTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { type } = await params;
  if (!isClaimType(type)) notFound();

  // Some claim types are restricted to specific positions (e.g. Class → coaches
  // & executives; Branch Ranking Reward / Jackpot → branch managers).
  const position =
    (session.user as { position?: string | null } | undefined)?.position ?? null;
  const roleType = (session.user as { role?: string } | undefined)?.role ?? null;
  const email = session.user.email;
  // Resolve department for access checks
  let department: string | null = null;
  const me = await prisma.users.findUnique({
    where: { email },
    select: {
      employment: {
        take: 1,
        orderBy: { employment_id: "desc" },
        select: { department: { select: { department_name: true } } },
      },
    },
  });
  department = me?.employment?.[0]?.department?.department_name ?? null;

  if (!canAccessClaimType(type, { position, roleType, email, department })) notFound();

  // Task Manager gate (2026-09-03) — see claim/task-gate.ts. Also enforced in
  // submitClaim, which is what actually stops a hand-rolled POST.
  const taskBlock = await claimTaskBlock(email);
  if (taskBlock) {
    return (
      <AppShell
        email={email}
        role={(session.user as { role?: string } | undefined)?.role ?? ""}
        name={session.user?.name ?? null}
      >
        <ClaimBlockedNotice gate={taskBlock} />
      </AppShell>
    );
  }

  let healthUsed = 0;
  if (type === "health") {
    const me = await prisma.users.findUnique({
      where: { email: session.user.email },
      select: { user_id: true },
    });
    if (me) healthUsed = await getHealthUsedThisYear(me.user_id);
  }

  const userEmail = session.user?.email ?? "";
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const userName = session.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <ClaimFormView type={type as ClaimType} healthUsed={healthUsed} />
    </AppShell>
  );
}
