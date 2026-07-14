import "server-only";
import { google, drive_v3 } from "googleapis";
import { Readable } from "node:stream";

let cachedClient: drive_v3.Drive | null = null;

function getDriveClient(): drive_v3.Drive {
  if (cachedClient) return cachedClient;

  const email = process.env.GOOGLE_DRIVE_SA_EMAIL?.trim().replace(/^"|"$/g, "").trim();
  const rawKey = process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "Google Drive credentials missing. Set GOOGLE_DRIVE_SA_EMAIL and GOOGLE_DRIVE_SA_PRIVATE_KEY.",
    );
  }

  const auth = new google.auth.JWT({
    email,
    key: rawKey.trim().replace(/^"|"$/g, "").trim().replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  cachedClient = google.drive({ version: "v3", auth });
  return cachedClient;
}

function getFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim().replace(/^"|"$/g, "").trim();
  if (!id) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured.");
  return id;
}

const EXT_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export function mimeForName(name: string): string | null {
  const ext = (name.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
  return EXT_MIME[ext] ?? null;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

// Cache resolved folder IDs by `${parentId}/${name}` so repeated uploads in the
// same process don't re-list the parent every time.
const folderIdCache = new Map<string, string>();

async function ensureFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string> {
  const cacheKey = `${parentId}/${name}`;
  const cached = folderIdCache.get(cacheKey);
  if (cached) return cached;

  // Drive search query — escape single quotes in name per Drive API rules.
  const escaped = name.replace(/'/g, "\\'");
  const list = await drive.files.list({
    q: `'${parentId}' in parents and name = '${escaped}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1,
  });

  const found = list.data.files?.[0]?.id;
  if (found) {
    folderIdCache.set(cacheKey, found);
    return found;
  }

  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error(`Failed to create Drive folder "${name}".`);
  folderIdCache.set(cacheKey, created.data.id);
  return created.data.id;
}

export async function uploadToDrive(
  file: File,
  options: { prefix?: string; folderPath?: string[] } = {},
): Promise<{ id: string; name: string }> {
  const drive = getDriveClient();
  const rootId = getFolderId();

  let parentId = rootId;
  if (options.folderPath && options.folderPath.length > 0) {
    for (const segment of options.folderPath) {
      if (!segment) continue;
      parentId = await ensureFolder(drive, parentId, segment);
    }
  }

  const safe = file.name.replace(/[^a-z0-9.\-_ ]/gi, "_");
  const baseName = options.prefix
    ? `${options.prefix}-${Date.now()}-${safe}`
    : `${Date.now()}-${safe}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const body = Readable.from(buffer);

  const mimeType =
    mimeForName(safe) || file.type || "application/octet-stream";

  const res = await drive.files.create({
    requestBody: { name: baseName, parents: [parentId] },
    media: { mimeType, body },
    fields: "id, name",
    supportsAllDrives: true,
  });

  if (!res.data.id) throw new Error("Drive upload returned no file ID.");
  return { id: res.data.id, name: res.data.name ?? baseName };
}

export interface DriveMeta {
  id: string;
  name: string;
  mimeType: string;
}

export async function getDriveMeta(fileId: string): Promise<DriveMeta | null> {
  try {
    const drive = getDriveClient();
    const res = await drive.files.get({
      fileId,
      fields: "id, name, mimeType",
      supportsAllDrives: true,
    });
    if (!res.data.id) return null;
    return {
      id: res.data.id,
      name: res.data.name ?? "attachment",
      mimeType: res.data.mimeType ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}

export async function streamFromDrive(fileId: string): Promise<{
  body: Readable;
  meta: DriveMeta;
}> {
  const drive = getDriveClient();
  const meta = await getDriveMeta(fileId);
  if (!meta) throw new Error("File not found.");

  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" },
  );
  return { body: res.data as unknown as Readable, meta };
}

export async function deleteFromDrive(fileId: string): Promise<void> {
  try {
    const drive = getDriveClient();
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch {
    // Swallow — best-effort cleanup.
  }
}

export function looksLikeDriveId(value: string): boolean {
  return !value.includes("/") && !value.includes(".") && value.length >= 20;
}
