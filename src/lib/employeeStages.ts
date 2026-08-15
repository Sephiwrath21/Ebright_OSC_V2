export type EmployeeStage = "pre" | "probation" | "onboarding" | "active" | "exit";

export const EMPLOYEE_STAGES: readonly EmployeeStage[] = ["pre", "probation", "onboarding", "active", "exit"];

export const STAGE_LABELS: Record<EmployeeStage, string> = {
  pre: "Pre",
  probation: "Probation",
  onboarding: "Onboarding",
  active: "Active",
  exit: "Exit",
};

export function isEmployeeStage(value: string): value is EmployeeStage {
  return (EMPLOYEE_STAGES as string[]).includes(value);
}

// Exact pill colors lifted from the Emp_Folder reference's style.css (card-pill--*/status-*).
// The light fills are translucent pastels that read as bright patches on a dark
// card, and their text is near-black, so each carries a dark companion. Five
// distinct hues either way, so the stages stay tellable apart in both themes.
export const STAGE_PILL_CLASSES: Record<EmployeeStage, string> = {
  pre: "bg-[#d8a1fa7d] text-[#621096] dark:bg-purple-900 dark:text-purple-200",
  probation: "bg-[#90aeee7d] text-[#390ff2] dark:bg-blue-900 dark:text-blue-200",
  onboarding: "bg-[#67eab37d] text-[#307348] dark:bg-emerald-900 dark:text-emerald-200",
  active: "bg-[#d8fc627d] text-[#6b6d02] dark:bg-lime-900 dark:text-lime-200",
  exit: "bg-[#f38e8e6b] text-[#961010] dark:bg-red-900 dark:text-red-200",
};

// Namelist person-card avatar colors — from each stage's own *_selectPP.css
// (only Onboarding/Active/Exit have a namelist; Pre/Probation skip it).
export const STAGE_AVATAR_CLASSES: Partial<Record<EmployeeStage, string>> = {
  onboarding: "bg-[#67eab37d] text-[#307348] dark:bg-emerald-900 dark:text-emerald-200",
  active: "bg-[#d9fd63a8] text-[#5c6e15] dark:bg-lime-900 dark:text-lime-200",
  exit: "bg-[#f48e8ea8] text-[#7a1f1f] dark:bg-red-900 dark:text-red-200",
};

// Namelist Block-view grouping: exactly 3 sections, keyed off employment.position
// (not employment_type) per real DB inspection — actual values seen are things
// like "PT COACH", "INTERN", "BM", "FT EXEC", "FT HOD", "FT COACH", "FT CEO",
// plus free-text variants ("Part-Time", "Full-Time Coach") and blanks. There is
// no "Protege" position anywhere in real data — the reference's By-Branch
// "Protege" and By-Department "Intern" groups are the SAME underlying INTERN
// people, just relabeled depending on which grouping mode is active (the
// caller decides the label; this only classifies into the 3 underlying buckets).
// Everything that isn't Intern or Part-Time-ish falls into Full Time by
// default (BM, CEO, admin, blank position) — confirmed with the user rather
// than assumed, since forcing e.g. a Branch Manager into Part Time would be
// wrong. No explicit "CEO"/"BM" branch needed here — they're covered by this
// same fallthrough, not a special case.
export type PositionGroup = "Full Time" | "Part Time" | "Intern";
export const POSITION_GROUPS: readonly PositionGroup[] = ["Full Time", "Part Time", "Intern"];

export function positionGroup(position: string | null): PositionGroup {
  if (!position) return "Full Time";
  const p = position.trim().toUpperCase();
  // "INT" is BranchStaff's own bare-abbreviation role value for interns
  // (seen live — e.g. role="INT" with employment_type left blank) — same
  // abbreviation-handling gap the "PT" branch below already covers for Part
  // Time, just missing for Intern until now (2026-08-13, see conversation:
  // Muhammad Amir Danial Bin Fazleesham fell through to the Full Time
  // default and was wrongly granted Probation membership as a result).
  if (p === "INT" || p.startsWith("INT ") || p.includes("INTERN")) return "Intern";
  if (p.startsWith("PT") || p.includes("PART")) return "Part Time";
  return "Full Time";
}

// The 7 real position values used for every Position dropdown across the app
// (Promotion's Current/New Position, Add Pre-stage Employee's Position) —
// values match real employment.position casing exactly (e.g. "PT COACH") so
// positionGroup() classifies them correctly the moment they're saved.
export const POSITION_OPTIONS: { value: string; label: string }[] = [
  { value: "PT COACH", label: "PT Coach" },
  { value: "FT COACH", label: "FT Coach" },
  { value: "FT EXEC", label: "FT EXEC" },
  { value: "FT HOD", label: "FT HOD" },
  { value: "INTERN", label: "INTERN" },
  { value: "BM", label: "BM" },
  { value: "CEO", label: "CEO" },
];
