// Serves an assigner-attached Guideline image (2026-07-30) from the Task
// Manager database. Session-gated: any signed-in portal user may view —
// guidelines are reference material, not sensitive data — but nothing is
// served to anonymous requests. Bytes are stored in ebright_yqtm
// (Guideline.imageData) so dev/staging/prod share them and Docker
// redeploys can't lose them.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/task-manager/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const guideline = await prisma.guideline.findUnique({
    where: { id },
    select: { imageMime: true, imageData: true },
  });
  if (!guideline?.imageData || !guideline.imageMime) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(guideline.imageData), {
    headers: {
      "Content-Type": guideline.imageMime,
      // Immutable per id — a guideline's image is never edited in place.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
