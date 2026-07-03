import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBranchSpaces } from "@/lib/clickup";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = process.env.CLICKUP_API_TOKEN;
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!token || !teamId) return NextResponse.json({ configured: false });

  try {
    const branches = await getBranchSpaces(teamId, token);
    return NextResponse.json({ configured: true, items: branches });
  } catch {
    return NextResponse.json({ error: "Failed to load branches" }, { status: 502 });
  }
}
