// Links new employees' Offer Letter and Resume from the
// GOOGLE_DRIVE_RECRUITMENT_HIRED_ID Drive folder into hrfs
// (employment.offer_letter_file_id / resume.resume_file_id) — 2026-09-04,
// see conversation. No `server-only` guard (see normalizeName.ts's own
// comment on why) so the CLI entry point in scripts/ can import this
// directly, same convention smsStaffSync.ts already established.
//
// The Drive side of this is read-only by explicit instruction — this file
// only ever calls drive.files.list (never create/update/delete) against
// GOOGLE_DRIVE_RECRUITMENT_HIRED_ID, using the "drive.readonly" scope so
// it's not even capable of writing there even if a bug called the wrong
// method. The hrfs side always dry-runs (computes and reports what it
// would write) unless the caller explicitly passes apply: true.

import { google, type drive_v3 } from "googleapis";
import { Pool } from "pg";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/normalizeName";

type PositionCategory = "FULL TIME" | "PART TIME" | "INTERN" | "EXECUTIVE" | "HOD";

// ── Live BranchStaff position resolution (2026-09-04, see conversation) ────
// The rest of the app resolves an employee's *displayed* position from
// ebright_hrfs.BranchStaff.role first, falling back to hrfs.employment.
// position only when there's no BranchStaff match — see
// resolveEffectivePosition in branchStaffProfile.ts. This file faithfully
// ports that same name+location matching (not a simplified approximation)
// rather than importing it directly, because branchStaffProfile.ts,
// ebright-hrfs.ts, employeeQueries.ts, and careerApplicationSync.ts all
// carry `import "server-only"`, which throws when imported outside a real
// Next.js server render — exactly what running this from a CLI script would
// do. Same reasoning as this file's own Drive client below, which similarly
// doesn't reuse src/lib/drive.ts's guarded-adjacent client. If any of those
// files' own matching logic ever changes, this needs updating to match.

interface BranchStaffRow {
  id: number;
  name: string | null;
  branch: string | null;
  department: string | null;
  role: string | null;
}

interface LocationOpt {
  code: string;
  name: string;
}

function getEbrightHrfsPool(): Pool {
  // Same env var priority as src/lib/ebright-hrfs.ts's own operationalUrl().
  const connectionString = process.env.EBRIGHT_HRFS_URL ?? process.env.HRFS_DATABASE_URL;
  if (!connectionString) throw new Error("EBRIGHT_HRFS_URL (or HRFS_DATABASE_URL) is not set.");
  return new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
}

function blank(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

// Case-insensitive code/name match — same rule as employeeQueries.ts's own
// resolveDepartmentBranch.
function resolveDepartmentBranch(
  raw: string,
  departments: LocationOpt[],
  branches: LocationOpt[],
): { branchCode: string | null; departmentCode: string | null } {
  const key = raw.trim().toLowerCase();
  const dept = departments.find((d) => d.code.toLowerCase() === key || d.name.toLowerCase() === key);
  const branch = !dept ? branches.find((b) => b.code.toLowerCase() === key || b.name.toLowerCase() === key) : undefined;
  return { branchCode: branch?.code ?? null, departmentCode: dept?.code ?? null };
}

// Same "/"-split compound-department fallback as branchStaffProfile.ts's own
// resolveRowLocation.
function resolveRowLocation(
  row: BranchStaffRow,
  branches: LocationOpt[],
  departments: LocationOpt[],
): { branchCode: string | null; departmentCode: string | null } {
  let resolved = row.department ? resolveDepartmentBranch(row.department, departments, branches) : null;
  if (resolved && !resolved.departmentCode && !resolved.branchCode && row.department?.includes("/")) {
    resolved = resolveDepartmentBranch(row.department.split("/")[0].trim(), departments, branches);
  }
  if (!resolved || (!resolved.departmentCode && !resolved.branchCode)) {
    resolved = row.branch ? resolveDepartmentBranch(row.branch, departments, branches) : null;
  }
  return { branchCode: resolved?.branchCode ?? null, departmentCode: resolved?.departmentCode ?? null };
}

function locationsConflict(
  localBranchCode: string | null,
  localDepartmentCode: string | null,
  resolvedBranchCode: string | null,
  resolvedDepartmentCode: string | null,
): boolean {
  if (localDepartmentCode && resolvedDepartmentCode) return localDepartmentCode !== resolvedDepartmentCode;
  if (localBranchCode && resolvedBranchCode) return localBranchCode !== resolvedBranchCode;
  return false;
}

// Same rigorous match as branchStaffProfile.ts's own
// matchBranchStaffForRealAccount: no match at all, or 2+ same-name
// candidates, or a location conflict -> null (caller falls back to local
// hrfs data), never a guess.
function matchBranchStaffForRealAccount(
  fullName: string,
  localBranchCode: string | null,
  localDepartmentCode: string | null,
  byNormalizedName: Map<string, BranchStaffRow[]>,
  branches: LocationOpt[],
  departments: LocationOpt[],
): BranchStaffRow | null {
  const key = normalizeName(fullName);
  if (!key) return null;
  const candidates = byNormalizedName.get(key);
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length > 1) return null;
  const row = candidates[0];
  const loc = resolveRowLocation(row, branches, departments);
  if (locationsConflict(localBranchCode, localDepartmentCode, loc.branchCode, loc.departmentCode)) return null;
  return row;
}

// Same priority as branchStaffProfile.ts's own resolveEffectivePosition:
// BranchStaff.role wins live when matched; hrfs.employment.position is only
// ever the fallback.
function resolveEffectivePosition(
  localPosition: string | null,
  fullName: string,
  branchCode: string | null,
  departmentCode: string | null,
  byNormalizedName: Map<string, BranchStaffRow[]>,
  branches: LocationOpt[],
  departments: LocationOpt[],
): string | null {
  const match = matchBranchStaffForRealAccount(fullName, branchCode, departmentCode, byNormalizedName, branches, departments);
  if (!match) return localPosition;
  return blank(match.role) ?? localPosition;
}

// hrfs department_code -> the exact Drive department-folder name, confirmed
// live (2026-09-04) by listing GOOGLE_DRIVE_RECRUITMENT_HIRED_ID's own
// children — not a guess. "CEO" has no entry: no matching Drive department
// folder exists for it, so a CEO-department employee always resolves to
// "department folder not found" below, same as any other unmapped case.
const DEPARTMENT_FOLDER_NAME: Record<string, string> = {
  FNC: "FINANCE",
  IOP: "IOP",
  MKT: "MARKETING",
  HR: "HUMAN RESOURCES",
  OPS: "OPERATION",
  OD: "OPTIMISATION",
  ACD: "ACADEMY",
};

// employment.position (trimmed + uppercased) -> Drive position-category
// folder. Built from the real distinct values confirmed live (2026-09-04,
// see conversation: 33 distinct values across the whole table), NOT a
// regex guess — several real values are genuinely ambiguous between two
// categories (e.g. "Coach/Executive", "Executive - Full Timer", bare
// "Coach"/"Admin"/"Facilitator") and are deliberately left OUT of this map
// rather than guessed at, so they fall through to "position not recognized"
// (logged, skipped) instead of silently searching the wrong folder. Add an
// entry here only once you're sure which single category it means.
// Keyed against the LIVE-RESOLVED position (BranchStaff.role-first, see
// resolveEffectivePosition below) — confirmed live 2026-09-04, this
// collapses to only 10 distinct real values across all 400 employees
// (vs. 33 messy legacy strings in the raw hrfs.employment.position column,
// which this map used to be keyed against before that switch). "INT" is
// BranchStaff's own bare-abbreviation role value for Intern (same
// abbreviation employeeStages.ts's positionGroup() special-cases) —
// confirmed the single largest resolved value after PT COACH (103 of 400).
// "ADMIN" and a null position are deliberately left unmapped (ambiguous/
// nothing to map), same as before.
const POSITION_CATEGORY_MAP: Record<string, PositionCategory> = {
  "PT COACH": "PART TIME",
  "PART TIME": "PART TIME",
  INT: "INTERN",
  INTERN: "INTERN",
  "FT COACH": "FULL TIME",
  "FULL TIME": "FULL TIME",
  BM: "FULL TIME",
  "FT EXEC": "EXECUTIVE",
  EXECUTIVE: "EXECUTIVE",
  "FT HOD": "HOD",
};

const FOLDER_MIME = "application/vnd.google-apps.folder";

function getDriveReadClient(): drive_v3.Drive {
  const email = process.env.GOOGLE_DRIVE_SA_EMAIL?.trim().replace(/^"|"$/g, "").trim();
  const rawKey = process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error("Google Drive credentials missing. Set GOOGLE_DRIVE_SA_EMAIL and GOOGLE_DRIVE_SA_PRIVATE_KEY.");
  }
  const auth = new google.auth.JWT({
    email,
    key: rawKey.trim().replace(/^"|"$/g, "").trim().replace(/\\n/g, "\n"),
    // Read-only on purpose (see this file's own top comment) — separate
    // from src/lib/drive.ts's own "drive.file" client, which this
    // deliberately does not reuse or modify.
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

async function listChildren(drive: drive_v3.Drive, folderId: string): Promise<drive_v3.Schema$File[]> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1000,
  });
  return res.data.files ?? [];
}

// Exported for recruitmentDriveLink.test.ts — pure, side-effect-free string
// logic, testable without any live Drive access (which turned out to matter:
// the recruitment folder's real sharing is Viewer-only for the service
// account, confirmed live 2026-09-04 via a 403 on a real write attempt —
// exactly the read-only enforcement this task asked for, but it also means
// this logic can't be exercised end-to-end against a live test file).
export function stripExtension(filename: string): string {
  return filename.replace(/\.[a-z0-9]+$/i, "");
}

// Squash to a single unbroken uppercase token — normalizeName only strips
// punctuation/hyphens/underscores (never replaces them with a space), so
// "John_Tan_Resume.pdf" and "John Tan Resume.pdf" both collapse to the same
// "JOHNTANRESUME"-shaped string, letting a plain substring check bridge
// whatever separator style a real filename happens to use.
function squash(s: string): string {
  return normalizeName(s).replace(/ /g, "");
}

// "Reasonable fuzzy matching" (per explicit spec — case/spacing/name-order/
// abbreviation tolerant), in two tiers: (1) the employee's whole name,
// squashed, appears as a contiguous substring of the squashed filename —
// covers the common case regardless of separator style; (2) order-
// independent fallback — every real name word (2+ chars, so a bare
// single-letter initial doesn't trivially match everything) appears
// somewhere in the filename, in any order — covers a reordered or
// abbreviated filename tier (1) would miss.
export function nameMatchesFile(employeeFullName: string, filenameNoExt: string): boolean {
  const fileSquashed = squash(filenameNoExt);
  const empSquashed = squash(employeeFullName);
  if (empSquashed.length >= 3 && fileSquashed.includes(empSquashed)) return true;

  const words = normalizeName(employeeFullName)
    .split(" ")
    .filter((w) => w.length >= 2);
  if (words.length === 0) return false;
  return words.every((w) => fileSquashed.includes(w));
}

export type DocField = "offer letter" | "resume";

// "Reference" files explicitly excluded (see the folder structure's own
// description — "(and possibly Reference)") — this task only ever links
// Offer Letter and Resume, never Reference. Replaces every run of
// non-alphanumeric characters with a single space BEFORE the \b checks —
// \b treats underscore as a word character, so "John_Tan_CV.docx" has no
// real word boundary before "CV" and would otherwise never match (caught
// live by recruitmentDriveLink.test.ts).
export function classifyDocType(filename: string): DocField | null {
  const cleaned = filename.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (/\breference\b/.test(cleaned)) return null;
  if (/\b(resume|cv)\b/.test(cleaned)) return "resume";
  if (/\boffer\b/.test(cleaned)) return "offer letter";
  return null;
}

export interface RecruitmentLinkReport {
  processed: number;
  offerLetterLinked: number;
  resumeLinked: number;
  skippedAlreadySet: { name: string; field: DocField }[];
  unmappedPosition: { name: string; department: string | null; position: string | null }[];
  folderNotFound: { name: string; department: string | null; position: string | null; missing: "department" | "position" }[];
  fileNotFound: { name: string; department: string; position: PositionCategory; missing: DocField[] }[];
  ambiguous: { name: string; department: string; position: PositionCategory; field: DocField; candidates: string[] }[];
  linked: { name: string; field: DocField; fileName: string; fileId: string }[];
  /** Distinct live-resolved position values actually seen this run (trimmed
   *  + uppercased, with a count each) — the BranchStaff-role-first value
   *  POSITION_CATEGORY_MAP is actually keyed against, not the raw
   *  hrfs.employment.position column. Surfaced on every run so the map can
   *  be kept in sync with reality as BranchStaff data changes, not just
   *  checked once. */
  resolvedPositionCounts: Record<string, number>;
}

export async function runRecruitmentDriveLink(options: { apply: boolean }): Promise<RecruitmentLinkReport> {
  const rootId = process.env.GOOGLE_DRIVE_RECRUITMENT_HIRED_ID;
  if (!rootId) throw new Error("GOOGLE_DRIVE_RECRUITMENT_HIRED_ID is not set.");
  const drive = getDriveReadClient();

  // One employment row per user_id (most recent by start_date) — same
  // "de-dup to the latest row" convention used everywhere else in this app
  // that reads employment history.
  const allEmployment = await prisma.employment.findMany({
    orderBy: { start_date: "desc" },
    include: { branch: true, department: true, users: { include: { user_profile: true, resume: true } } },
  });
  const seen = new Set<number>();
  const rows = allEmployment.filter((e) => {
    if (seen.has(e.user_id)) return false;
    seen.add(e.user_id);
    return true;
  });

  // Live position resolution setup — see this file's own top comment on why
  // this is a local port rather than an import of the app's own (guarded)
  // versions.
  const [branchRows, departmentRows] = await Promise.all([
    prisma.branch.findMany({ select: { branch_code: true, branch_name: true } }),
    prisma.department.findMany({ select: { department_code: true, department_name: true } }),
  ]);
  const branches: LocationOpt[] = branchRows
    .filter((b) => b.branch_code)
    .map((b) => ({ code: b.branch_code!, name: b.branch_name }));
  const departments: LocationOpt[] = departmentRows.map((d) => ({ code: d.department_code, name: d.department_name }));

  const ebrightHrfsPool = getEbrightHrfsPool();
  const byNormalizedName = new Map<string, BranchStaffRow[]>();
  try {
    const { rows: bsRows } = await ebrightHrfsPool.query<BranchStaffRow>(
      `SELECT id, name, branch, department, role FROM public."BranchStaff"`,
    );
    for (const r of bsRows) {
      const key = normalizeName(r.name ?? "");
      if (!key) continue;
      const list = byNormalizedName.get(key) ?? [];
      list.push(r);
      byNormalizedName.set(key, list);
    }
  } finally {
    await ebrightHrfsPool.end();
  }

  const rootChildren = await listChildren(drive, rootId);
  const deptFolderIdByName = new Map(
    rootChildren.filter((f) => f.mimeType === FOLDER_MIME).map((f) => [f.name!.trim().toUpperCase(), f.id!]),
  );
  // Cache every folder's own children by folder id — a department folder is
  // listed once and reused across every employee in it; a category folder
  // likewise once and reused across every employee in that category.
  const childrenCache = new Map<string, drive_v3.Schema$File[]>();
  async function children(folderId: string): Promise<drive_v3.Schema$File[]> {
    const cached = childrenCache.get(folderId);
    if (cached) return cached;
    const fetched = await listChildren(drive, folderId);
    childrenCache.set(folderId, fetched);
    return fetched;
  }

  const report: RecruitmentLinkReport = {
    processed: 0,
    offerLetterLinked: 0,
    resumeLinked: 0,
    skippedAlreadySet: [],
    unmappedPosition: [],
    folderNotFound: [],
    fileNotFound: [],
    ambiguous: [],
    linked: [],
    resolvedPositionCounts: {},
  };

  for (const row of rows) {
    report.processed++;
    const fullName = row.users.user_profile?.full_name ?? `user_id ${row.user_id}`;
    const alreadyOfferLetter = row.offer_letter_file_id != null;
    const alreadyResume = row.users.resume?.resume_file_id != null;
    if (alreadyOfferLetter) report.skippedAlreadySet.push({ name: fullName, field: "offer letter" });
    if (alreadyResume) report.skippedAlreadySet.push({ name: fullName, field: "resume" });
    if (alreadyOfferLetter && alreadyResume) continue;

    const deptCode = row.department?.department_code ?? null;
    const deptFolderName = deptCode ? DEPARTMENT_FOLDER_NAME[deptCode] : undefined;
    const deptFolderId = deptFolderName ? deptFolderIdByName.get(deptFolderName) : undefined;

    // Live-resolved position — BranchStaff.role first, hrfs.employment.
    // position only as the fallback (see this file's own top comment). This
    // is what the rest of the app actually displays, not necessarily what's
    // stored in the employment.position column.
    const effectivePosition = resolveEffectivePosition(
      row.position,
      fullName,
      row.branch?.branch_code ?? null,
      deptCode,
      byNormalizedName,
      branches,
      departments,
    );
    const positionKey = effectivePosition?.trim().toUpperCase() ?? "";
    if (positionKey) report.resolvedPositionCounts[positionKey] = (report.resolvedPositionCounts[positionKey] ?? 0) + 1;

    if (!deptFolderId) {
      report.folderNotFound.push({
        name: fullName,
        department: row.department?.department_name ?? null,
        position: effectivePosition,
        missing: "department",
      });
      continue;
    }

    const category = POSITION_CATEGORY_MAP[positionKey];
    if (!category) {
      report.unmappedPosition.push({ name: fullName, department: row.department?.department_name ?? null, position: effectivePosition });
      continue;
    }

    const deptChildren = await children(deptFolderId);
    const categoryFolder = deptChildren.find((f) => f.mimeType === FOLDER_MIME && f.name!.trim().toUpperCase().startsWith(category));
    if (!categoryFolder) {
      report.folderNotFound.push({
        name: fullName,
        department: row.department?.department_name ?? null,
        position: effectivePosition,
        missing: "position",
      });
      continue;
    }

    const files = (await children(categoryFolder.id!)).filter((f) => f.mimeType !== FOLDER_MIME);
    const missing: DocField[] = [];

    for (const [field, already] of [
      ["offer letter", alreadyOfferLetter],
      ["resume", alreadyResume],
    ] as const) {
      if (already) continue;
      const candidates = files.filter((f) => classifyDocType(f.name!) === field && nameMatchesFile(fullName, stripExtension(f.name!)));
      if (candidates.length === 0) {
        missing.push(field);
      } else if (candidates.length > 1) {
        report.ambiguous.push({
          name: fullName,
          department: deptFolderName!,
          position: category,
          field,
          candidates: candidates.map((c) => c.name!),
        });
      } else {
        const fileId = candidates[0].id!;
        report.linked.push({ name: fullName, field, fileName: candidates[0].name!, fileId });
        if (field === "offer letter") report.offerLetterLinked++;
        else report.resumeLinked++;
        if (options.apply) {
          if (field === "offer letter") {
            await prisma.employment.update({ where: { employment_id: row.employment_id }, data: { offer_letter_file_id: fileId } });
          } else {
            await prisma.resume.upsert({
              where: { user_id: row.user_id },
              create: { user_id: row.user_id, resume_file_id: fileId },
              update: { resume_file_id: fileId },
            });
          }
        }
      }
    }
    if (missing.length > 0) {
      report.fileNotFound.push({ name: fullName, department: deptFolderName!, position: category, missing });
    }
  }

  return report;
}
