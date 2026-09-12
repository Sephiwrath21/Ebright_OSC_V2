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
    // drive.readonly added 2026-09-04 (see conversation) alongside the
    // original drive.file — additive, not a replacement: drive.file still
    // covers every existing upload/delete (uploadToDrive/deleteFromDrive
    // only ever touch files this same service account created itself, which
    // drive.file already grants full access to on its own). drive.readonly
    // is what getDriveMeta/streamFromDrive actually need for "View file" to
    // work on a file this account didn't create but was merely shared into —
    // confirmed live: drive.file alone returned "File not found" for a real
    // folder inside GOOGLE_DRIVE_RECRUITMENT_HIRED_ID (shared by the
    // recruitment team, not created by this app), while drive.readonly (or
    // this combined scope set) can see it.
    scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive.readonly"],
  });

  cachedClient = google.drive({ version: "v3", auth });
  return cachedClient;
}

// Root folder resolution — defaults to the shared GOOGLE_DRIVE_FOLDER_ID
// (Leave/Claim/Induction/Offboarding's attachment fields all still use this
// one shared root). Resume/CV, Medical Report, and Confirmation/Extension
// Letter each got their own dedicated Drive folder — pass folderEnvVar to
// uploadToDrive to route a field's uploads there instead.
function getFolderId(envVar: string = "GOOGLE_DRIVE_FOLDER_ID"): string {
  const id = process.env[envVar]?.trim().replace(/^"|"$/g, "").trim();
  if (!id) throw new Error(`${envVar} is not configured.`);
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

// --- New single-root Drive layout (2026-09-05, see conversation) ---
// The old layout was 16+ separate hardcoded env vars, one Drive folder ID per
// document category. The new layout is ONE root folder
// (GOOGLE_DRIVE_EMPLOYEE_FOLDER_ID) containing named tab/category subfolders,
// each optionally containing named document-type subfolders one level deeper
// (e.g. root -> "HR_INFO" -> "RESUME"). resolveDriveFolderId walks that path
// by NAME (case-insensitive), read-only — it never creates a folder, so a
// typo'd or not-yet-created name fails loudly instead of silently uploading
// to the wrong place. Cached per level (`${parentId}/${lowercased name}`),
// forever per process, same as folderIdCache above — a rename only needs a
// redeploy to take effect, not a TTL.
const resolvedFolderCache = new Map<string, string>();

async function resolveOneFolderLevel(parentId: string, name: string): Promise<string> {
  const cacheKey = `${parentId}/${name.toLowerCase()}`;
  const cached = resolvedFolderCache.get(cacheKey);
  if (cached) return cached;

  const drive = getDriveClient();
  const list = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 200,
  });

  const match = list.data.files?.find((f) => f.name?.toLowerCase() === name.toLowerCase());
  if (!match?.id) {
    throw new Error(`Drive subfolder "${name}" not found under parent folder ${parentId}.`);
  }
  resolvedFolderCache.set(cacheKey, match.id);
  return match.id;
}

// Walks rootFolderId -> subfolderPath[0] -> subfolderPath[1] -> ... by name,
// one Drive API list call per not-yet-cached level. Supports both the 1-level
// (root -> "EMP_CONTRACT") and 2-level (root -> "HR_INFO" -> "RESUME") shapes
// the new layout uses — pass however many path segments the category needs.
export async function resolveDriveFolderId(rootFolderId: string, ...subfolderPath: string[]): Promise<string> {
  let currentId = rootFolderId;
  for (const name of subfolderPath) {
    currentId = await resolveOneFolderLevel(currentId, name);
  }
  return currentId;
}

// Resolves a category's folder under the new single-root layout. No
// fallback (2026-09-08, see conversation — migration is complete for every
// category except Leave/Claim/Induction, which were deliberately never
// migrated and still call getFolderId(folderEnvVar) directly): a missing
// root or a not-yet-created subfolder throws loudly rather than silently
// uploading to the wrong place.
export async function resolveEmployeeFolderId(...subfolderPath: string[]): Promise<string> {
  const rootId = process.env.GOOGLE_DRIVE_EMPLOYEE_FOLDER_ID?.trim().replace(/^"|"$/g, "").trim();
  if (!rootId) {
    throw new Error("GOOGLE_DRIVE_EMPLOYEE_FOLDER_ID is not configured.");
  }
  return resolveDriveFolderId(rootId, ...subfolderPath);
}

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
  options: { prefix?: string; folderPath?: string[]; folderEnvVar?: string; folderId?: string } = {},
): Promise<{ id: string; name: string }> {
  const drive = getDriveClient();
  // folderId (pre-resolved, e.g. via resolveEmployeeFolderId) takes priority
  // over folderEnvVar's old direct-env-var lookup — every category migrated
  // to the new single-root layout passes folderId; Leave/Claim/Induction
  // (2026-09-08, see conversation — deliberately staying on the old env
  // vars, permanently, not "for now") keep passing folderEnvVar.
  const rootId = options.folderId ?? getFolderId(options.folderEnvVar);

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

// Moves the file to Drive trash rather than permanently deleting it — the
// service account's Shared Drive role grants canEdit/canTrash but NOT
// canDelete (confirmed via files.get().capabilities), so files.delete()
// silently 404s on every call while files.update({trashed:true}) succeeds.
// This was the actual cause of "replaced/removed files never disappear from
// Drive" — deleteFromDrive's own error swallowing (below) hid the failure.
export async function deleteFromDrive(fileId: string): Promise<void> {
  try {
    const drive = getDriveClient();
    await drive.files.update({ fileId, requestBody: { trashed: true }, supportsAllDrives: true });
  } catch {
    // Swallow — best-effort cleanup.
  }
}

export function looksLikeDriveId(value: string): boolean {
  return !value.includes("/") && !value.includes(".") && value.length >= 20;
}
