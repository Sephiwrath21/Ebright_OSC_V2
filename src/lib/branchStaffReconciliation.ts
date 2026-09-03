import "server-only";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import { normalizeName } from "@/lib/careerApplicationSync";

export interface MissingBranchStaffRow {
  branchStaffId: number;
  name: string;
  branch: string | null;
  department: string | null;
  role: string | null;
  startDate: string | null;
}

interface RawBranchStaffRow {
  id: number;
  name: string | null;
  branch: string | null;
  department: string | null;
  role: string | null;
  start_date: string | null;
}

// Detection-only — per explicit decision (see conversation, 2026-08-22
// BranchStaff/employment reconciliation): auto-creating employment rows off
// pure normalized-name matching is too risky to run unattended. The audit
// that led to this function found 13 of 15 raw "missing" BranchStaff rows
// were false positives — 7 from the normalizeName() embedded-\r/\n bug
// (fixed alongside this), 6 from ordinary name variance (a missing
// "Bin/Binti", a truncated name, a one-letter spelling difference) that
// name-matching alone can't resolve. A blind auto-create job on this signal
// risks creating duplicate accounts for people who already have one under a
// slightly different spelling. This function only detects and reports;
// actual creation stays a manual, reviewed action (the same process used to
// create the 2 real gaps this audit found — Dharshiny A/P Suresh Raja,
// Aniq Afifi Bin Sarli).
//
// Same matching key as the rest of the app (normalizeName — see
// matchBranchStaffForRealAccount in branchStaffProfile.ts): there is no FK
// from employment/users to BranchStaff anywhere in this schema. A returned
// row here is not a certainty — same residual name-variance false-positive
// rate as above should be expected; a human should still eyeball each one
// (e.g. a quick fuzzy/NRIC cross-check, same as this feature's own audit
// did) before creating anything.
export async function detectBranchStaffMissingEmployment(): Promise<MissingBranchStaffRow[]> {
  const [{ rows: bsRows }, profiles] = await Promise.all([
    queryEbrightHrfs<RawBranchStaffRow>(`SELECT id, name, branch, department, role, start_date FROM public."BranchStaff"`),
    prisma.user_profile.findMany({ select: { full_name: true } }),
  ]);

  const knownNames = new Set(profiles.map((p) => normalizeName(p.full_name)).filter(Boolean));

  const missing: MissingBranchStaffRow[] = [];
  for (const row of bsRows) {
    const key = normalizeName(row.name ?? "");
    if (!key || knownNames.has(key)) continue;
    missing.push({
      branchStaffId: row.id,
      name: row.name?.trim() ?? "",
      branch: row.branch,
      department: row.department,
      role: row.role,
      startDate: row.start_date,
    });
  }
  return missing;
}
