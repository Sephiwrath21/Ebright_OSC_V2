import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { streamFromDrive, mimeForName } from "@/lib/drive";
import { canReviewClaims } from "@/app/claim/roles";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: fileId } = await params;
  if (!fileId) {
    return NextResponse.json({ error: "Missing file id" }, { status: 400 });
  }

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      user_id: true,
      role_id: true,
      email: true,
      role: { select: { role_type: true } },
    },
  });
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isFinance = canReviewClaims({
    role_id: me.role_id,
    email: me.email,
    role_type: me.role?.role_type ?? null,
  });

  const [claim, leave] = await Promise.all([
    prisma.claim.findFirst({
      where: {
        OR: [
          { attachment: fileId },
          { attachment: { contains: fileId } },
        ],
      },
      select: { user_id: true },
    }),
    prisma.leave_request.findFirst({
      where: {
        OR: [
          { attachment: fileId },
          { attachment: { contains: fileId } },
        ],
      },
      select: { user_id: true },
    }),
  ]);

  const canAccessClaim = !!claim && (isFinance || claim.user_id === me.user_id);
  // Previously only the leave's own owner could view its attachment — HR/
  // staff opening a DIFFERENT employee's Leave tab (the normal way this
  // route is reached from a profile page) got a 404 even though they're
  // allowed to see that employee's record at all. Extended to match: same
  // department/branch/full-access scope check every other Employee Record
  // view already applies (see employeeScope.ts) — getEmployeeOverviewRowById
  // returns null for anyone outside the current session's scope, same as it
  // does for the profile page itself.
  let canAccessLeave = !!leave && leave.user_id === me.user_id;
  if (!canAccessLeave && leave) {
    const { getEmployeeOverviewRowById } = await import("@/lib/employeeQueries");
    canAccessLeave = (await getEmployeeOverviewRowById(leave.user_id)) != null;
  }
  if (!canAccessClaim && !canAccessLeave) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { body, meta } = await streamFromDrive(fileId);
    const wantDownload = req.nextUrl.searchParams.get("download") !== null;
    const disposition = wantDownload ? "attachment" : "inline";
    const safeName = (meta.name || "attachment").replace(/"/g, '\\"');
    const resolvedMime =
      mimeForName(meta.name) ?? meta.mimeType ?? "application/octet-stream";

    const webStream = Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": resolvedMime,
        "Content-Disposition": `${disposition}; filename="${safeName}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
