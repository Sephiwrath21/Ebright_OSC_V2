import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import NewClaimView from "@/app/components/NewClaimView";
import { prisma } from "@/lib/prisma";
import ClaimBlockedNotice from "@/app/claim/ClaimBlockedNotice";
import { claimTaskBlock } from "@/app/claim/task-gate";

export const dynamic = "force-dynamic";

export default async function NewClaimPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userEmail = session.user?.email ?? "";
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const userPosition =
    (session.user as { position?: string | null } | undefined)?.position ?? null;
  const userName = session.user?.name ?? null;

  // Task Manager gate (2026-09-03) — see claim/task-gate.ts.
  const taskBlock = userEmail ? await claimTaskBlock(userEmail) : null;
  if (taskBlock) {
    return (
      <AppShell email={userEmail} role={userRole} name={userName}>
        <ClaimBlockedNotice gate={taskBlock} />
      </AppShell>
    );
  }

  // Resolve user's current department (if any)
  let userDepartment: string | null = null;
  if (session.user?.email) {
    const me = await prisma.users.findUnique({
      where: { email: session.user.email },
      select: {
        employment: {
          take: 1,
          orderBy: { employment_id: "desc" },
          select: { department: { select: { department_name: true } } },
        },
      },
    });
    userDepartment = me?.employment?.[0]?.department?.department_name ?? null;
  }

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <NewClaimView
        position={userPosition}
        roleType={userRole}
        email={userEmail}
        department={userDepartment}
      />
    </AppShell>
  );
}
