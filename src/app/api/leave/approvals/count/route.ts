import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getActiveDepartmentId,
  countHodPending,
  countHrQueue,
} from "@/app/attendance/leave/approval-queries";
import { HOD_POSITION, HR_OVERVIEW_EMAIL } from "@/app/attendance/leave/approval-logic";

export const dynamic = "force-dynamic";

// Badge count:
//  - HR (hr@ebright.my)    -> HOD-approved requests awaiting final approval
//  - HOD (position FT HOD) -> pending requests in their department
//  - else                  -> 0
export async function GET() {
 const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ count: 0 });
  const email = session.user.email.toLowerCase();
  const position = (session.user as { position?: string | null }).position ?? null;

  if (email === HR_OVERVIEW_EMAIL) {
    return NextResponse.json({ count: await countHrQueue() });
  }

  if (position === HOD_POSITION) {
    const user = await prisma.users.findUnique({
      where: { email: session.user.email },
      select: { user_id: true },
    });
    if (!user) return NextResponse.json({ count: 0 });
    const departmentId = await getActiveDepartmentId(user.user_id);
    if (departmentId == null) return NextResponse.json({ count: 0 });
    return NextResponse.json({ count: await countHodPending(departmentId) });
  }

  return NextResponse.json({ count: 0 });
}
