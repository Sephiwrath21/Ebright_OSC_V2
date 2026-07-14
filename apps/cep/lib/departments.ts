/**
 * Departments that own Content templates in the 48-week per-parent conveyer-belt
 * calendar (source: "Ebright Email Marketing Templates" spreadsheet import).
 * Order below is also send PRIORITY — when multiple departments have content for
 * the same weekNumber, the earliest one in this array is the one marked isActive
 * (see prisma/importWeeklyContent.ts).
 */
export const DEPARTMENTS = [
  'CEO',
  'ACD',
  'MKT',
  'MKT_REFERRAL',
  'HR',
  'FNC',
  'OD',
  'OPS',
  'AD_HOC',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  CEO: 'CEO',
  ACD: 'ACD',
  MKT: 'MKT',
  MKT_REFERRAL: 'MKT Referral',
  HR: 'HR',
  FNC: 'FNC',
  OD: 'OD',
  OPS: 'OPS',
  AD_HOC: 'Ad Hoc',
};

/** Priority index — lower is higher priority. Used to pick the sendable/active
 * template when multiple departments have content for the same week. */
export function departmentPriority(dept: string): number {
  const i = DEPARTMENTS.indexOf(dept as Department);
  return i === -1 ? DEPARTMENTS.length : i;
}
