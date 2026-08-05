// Serves an assignee-uploaded Proof image (2026-07-30, the My Tasks "Proof"
// column). Session-gated: any signed-in portal user may view — proof exists
// precisely so assigners/overseers can check it — but nothing is served to
// anonymous requests.
//
// Storage (2026-08-04): every upload goes to Google Drive (Proof.driveFileId)
// — this route proxies the bytes via src/lib/drive.ts's streamFromDrive,
// same pattern as api/attachment/[id]. The original in-DB-bytes fallback
// (imageMime/imageData) was removed once its only 7 rows — all test data
// pre-dating the Drive cutover — were deleted; every row now has a
// driveFileId.
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { auth } from "@/auth";
import { prisma } from "@/task-manager/prisma";
import { streamFromDrive } from "@/lib/drive";

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
    select: { driveFileId: true },
  });
  if (!proof?.driveFileId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { body, meta } = await streamFromDrive(proof.driveFileId);
    const webStream = Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(webStream, {
      headers: {
        "Content-Type": meta.mimeType || "application/octet-stream",
        // A re-upload REPLACES the file under the same Proof id — unlike
        // guideline images this URL is not immutable, so keep the cache
        // window short.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
