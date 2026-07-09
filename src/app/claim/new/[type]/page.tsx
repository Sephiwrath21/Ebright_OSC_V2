import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import ClaimFormView from "@/app/components/ClaimFormView";
import { type ClaimType, isClaimType, canAccessClaimType } from "@/app/claim/claim-types";

export const dynamic = "force-dynamic";

async function getHealthUsedThisYear(userId: number): Promise<number> {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const res = await prisma.claim.aggregate({
    where: {
      user_id: userId,
      claim_type: "health",
      status: { in: ["approved", "disbursed", "received"] },
      claim_date: { gte: yearStart, lte: yearEnd },
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
