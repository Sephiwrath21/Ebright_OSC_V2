import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const email = process.env.GOOGLE_DRIVE_SA_EMAIL;
  const rawKey = process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  const debugInfo = {
    email: {
      exists: !!email,
      length: email?.length ?? 0,
      valueCleaned: email?.trim().replace(/^"|"$/g, "").trim(),
    },
    folderId: {
      exists: !!folderId,
      length: folderId?.length ?? 0,
      valueCleaned: folderId?.trim().replace(/^"|"$/g, "").trim(),
    },
    privateKey: {
      exists: !!rawKey,
      length: rawKey?.length ?? 0,
      startsWithQuote: rawKey?.startsWith('"') ?? false,
      endsWithQuote: rawKey?.endsWith('"') ?? false,
      endsWithCR: rawKey?.endsWith("\r") ?? false,
      endsWithNL: rawKey?.endsWith("\n") ?? false,
      containsLiteralSlashN: rawKey?.includes("\\n") ?? false,
      containsRealNewline: rawKey?.includes("\n") ?? false,
    },
    authTest: {
      ok: false,
      errorName: "",
      errorMessage: "",
      errorStack: "",
    }
  };

  if (email && rawKey) {
    try {
      const cleanedKey = rawKey.trim().replace(/^"|"$/g, "").trim().replace(/\\n/g, "\n");
      const jwt = new google.auth.JWT({
        email: email.trim().replace(/^"|"$/g, "").trim(),
        key: cleanedKey,
        scopes: ["https://www.googleapis.com/auth/drive.file"],
      });
      // Try to get credentials (forces key parsing but doesn't make network request if it fails decoding first)
      await jwt.authorize();
      debugInfo.authTest.ok = true;
    } catch (e) {
      const err = e as Error;
      debugInfo.authTest.ok = false;
      debugInfo.authTest.errorName = err.name;
      debugInfo.authTest.errorMessage = err.message;
      debugInfo.authTest.errorStack = err.stack?.split("\n").slice(0, 5).join("\n") ?? "";
    }
  }

  return NextResponse.json(debugInfo);
}
