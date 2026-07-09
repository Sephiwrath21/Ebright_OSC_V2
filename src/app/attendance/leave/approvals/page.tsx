import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import LeaveApprovalsView from "@/app/components/LeaveApprovalsView";
import type { HodApprovalItem } from "@/app/components/HodApprovalTable";
import { getActiveDepartmentId, loadHodPending, loadHrQueue } from "../approval-queries";
import { HOD_POSITION, HR_OVERVIEW_EMAIL } from "../approval-logic";

export const dynamic = "force-dynamic";

export default async function LeaveApprovalsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const email = session.user.email;
  const position = (session.user as { position?: string } | undefined)?.position ?? "";
  const role = (session.user as { role?: string } | undefined)?.role ?? "";
  const isHod = position === HOD_POSITION;
  const isHr = email.toLowerCase() === HR_OVERVIEW_EMAIL;
  if (!isHod && !isHr) redirect("/home");
  const mode: "hod" | "hr" = isHod ? "hod" : "hr";

  const me = await prisma.users.findUnique({
    where: { email },
    select: { user_id: true },
  });
  if (!me) redirect("/login");

  let items: HodApprovalItem[] = [];
  if (mode === "hod") {
    const departmentId = await getActiveDepartmentId(me.user_id);
    items = departmentId != null ? await loadHodPending(departmentId) : [];
  } else {
    items = await loadHrQueue();
  }

  const userName = session.user.name ?? null;

  return (
    <AppShell email={email} role={role} name={userName}>
      <LeaveApprovalsView mode={mode} items={items} />
    </AppShell>
  );
}

