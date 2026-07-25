import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isCrmAvailable } from "@/lib/crm-db";
import { getContactDetail } from "@/lib/crm-contact-detail";

export const dynamic = "force-dynamic";

// GET /api/crm/contacts/[id] — superadmin contact profile (read-only, sourced
// from ebright_crm). Mirrors v1's getContactById + getContactActivity.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  if (me?.role?.role_type !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isCrmAvailable()) {
    return NextResponse.json({ error: "CRM database not configured (CRM_DATABASE_URL unset)" }, { status: 503 });
  }

  try {
    const { id } = await params;
    const contact = await getContactDetail(id);
    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(contact);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/contacts/[id]]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
