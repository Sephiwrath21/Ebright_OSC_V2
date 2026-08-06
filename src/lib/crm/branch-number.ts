/**
 * Extract the `tkt_branch.branch_number` for a CRM branch name.
 *
 * The CRM stores centres as `"01 Ebright (Rimbayu)"`; the ticketing module's
 * `tkt_branch.branch_number` is just `"01"`, so the leading two digits map
 * straight across.
 *
 * Department branches have no such prefix — "Ebright Marketing", "Ebright HR",
 * "00 Ebright (OD)" — so the prefix rule returned null for them and the ticket
 * form silently fell back to the first branch in the list, which sorts to
 * "00 Ebright (OD)". That is why tickets raised by the Marketing account were
 * filed as OD submissions. Departments now resolve through DEPARTMENTS.
 *
 * Returns null only when the name is neither a numbered centre nor a known
 * department (e.g. the synthetic "All Branches" pipeline) — callers must treat
 * that as "no ticket branch", never as a reason to pick an arbitrary one.
 */

import { departmentForBranchName } from '@/lib/crm/departments'

export function crmBranchToTktBranchNumber(name: string | null | undefined): string | null {
  if (!name) return null

  // Departments first: "00 Ebright (OD)" both starts with digits AND is a
  // department, and its department entry is the authoritative mapping.
  const dept = departmentForBranchName(name)
  if (dept) return dept.tktBranchNumber

  const m = name.match(/^(\d{2})/)
  return m ? m[1] : null
}
