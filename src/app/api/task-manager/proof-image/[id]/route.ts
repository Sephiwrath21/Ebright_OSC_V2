// Serves an assignee-uploaded Proof image (2026-07-30, the My Tasks "Proof"
// column). Session-gated: any signed-in portal user may view — proof exists
// precisely so assigners/overseers can check it — but nothing is served to
// anonymous requests.
//
// Storage (2026-08-04): every upload since goes to Google Drive
// (Proof.driveFileId) — this route proxies the bytes via src/lib/drive.ts's
// streamFromDrive, same pattern as api/attachment/[id]. The handful of rows
// uploaded before the cutover still have their bytes in Postgres
// (imageMime/imageData, now nullable/legacy) — served straight from the DB
// as before so nothing already uploaded breaks. New uploads never write to
// those columns, so this fallback branch only ever serves pre-cutover rows.
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
    select: { driveFileId: true, imageMime: true, imageData: true },
  });
  if (!proof) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A re-upload REPLACES the file under the same Proof id — unlike
  // guideline images this URL is not immutable, so keep the cache window
  // short either way.
  const cacheControl = "private, max-age=300";

  if (proof.driveFileId) {
    try {
      const { body, meta } = await streamFromDrive(proof.driveFileId);
      const webStream = Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>;
      return new NextResponse(webStream, {
        headers: {
          "Content-Type": meta.mimeType || "application/octet-stream",
          "Cache-Control": cacheControl,
        },
      });
    } catch {
      return NextResponse.json({ error: "File unavailable" }, { status: 404 });
    }
  }

  if (proof.imageData && proof.imageMime) {
    return new NextResponse(new Uint8Array(proof.imageData), {
      headers: { "Content-Type": proof.imageMime, "Cache-Control": cacheControl },
    });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
