import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) return NextResponse.json({ configured: false });

  try {
    const departments = await prisma.department.findMany({
      select: {
        department_id: true,
        department_code: true,
        department_name: true,
      },
      orderBy: { department_name: "asc" },
    });

    return NextResponse.json({
      configured: true,
      items: departments.map((d) => ({
        id: d.department_id.toString(),
        code: d.department_code,
        name: d.department_name,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load departments" }, { status: 502 });
  }
}
