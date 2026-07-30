// Serves an assignee-uploaded Proof image (2026-07-30, the My Tasks "Proof"
// column) from the Task Manager database. Session-gated: any signed-in
// portal user may view — proof exists precisely so assigners/overseers can
// check it — but nothing is served to anonymous requests. Bytes are stored
// in ebright_yqtm (Proof.imageData) so dev/staging/prod share them and
// Docker redeploys can't lose them. Mirror of guideline-image/[id].
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
  const proof = await prisma.proof.findUnique({
    where: { id },
    select: { imageMime: true, imageData: true },
  });
  if (!proof) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(proof.imageData), {
    headers: {
      "Content-Type": proof.imageMime,
      // A re-upload REPLACES the bytes under the same id (upsert on
      // runBlockId) — unlike guideline images this URL is not immutable,
      // so keep the cache window short.
      "Cache-Control": "private, max-age=300",
    },
  });
}
