import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getDepartmentMembers } from "@/lib/department-members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Roster for a department: active HQ members, each flagged online/offline.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug } = await params;
  try {
    const members = await getDepartmentMembers(slug);
    return NextResponse.json({ members });
  } catch (e) {
    console.error("[members] fetch failed for", slug, e instanceof Error ? e.message : e);
    return NextResponse.json({ members: [] });
  }
}
