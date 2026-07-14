/**
 * Display-only numbering for branch lists (dropdowns, filters, the Branches
 * admin page) — "01", "02", etc. There is no stored order/number field; the
 * prefix is always derived from position in an alphabetically-sorted list
 * (branches are fetched with `orderBy: { name: 'asc' }` everywhere), so it
 * stays correct automatically as branches are added/renamed/deactivated.
 */
export function branchNumberPrefix(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export function numberedBranchLabel(index: number, name: string): string {
  return `${branchNumberPrefix(index)}. ${name}`;
}
