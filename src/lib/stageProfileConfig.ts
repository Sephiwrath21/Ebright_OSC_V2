import type { EmployeeStage } from "@/lib/employeeStages";

export interface ProfileSection {
  key: string;
  label: string;
  /** Nested sections (e.g. Exit's collapsible "Clearance" group) render under this group label instead of as a top-level tab. */
  group?: string;
}

// Unified rail-pill size (padding + font) — every stage's rail, plus
// EmployeeRecordView.tsx's own separate rail, share these two constants so
// pill dimensions can never drift apart again (2026-08-13, see conversation
// — Onboarding's pills were visibly larger than Active's before this).
// Colors still vary per stage (see each navRail.base/current below); only
// size is unified.
export const RAIL_PILL_PADDING_CLASS = "py-2 px-2 sm:py-[11px] sm:px-[16px]";
export const RAIL_PILL_FONT_SIZE_CLASS = "text-xs sm:text-sm";

/** Exact colors/spacing for the vertical .tab-nav/.nav-pill rail, per stage — lifted from each stage's own CSS in Emp_Folder (every stage reuses the same rail *mechanics*, only color/spacing differs). */
export interface NavRailStyle {
  widthPx: number;
  gapPx: number;
  paddingClass: string;
  fontSizeClass: string;
  base: string;
  current: string;
  /** Exit's nested "Clearance" sub-pills — amber, indented. Undefined for every other stage. */
  clearanceBase?: string;
  clearanceCurrent?: string;
}

export interface StageProfileConfig {
  /** Pre and Probation skip the Branch/Department drill-down — flat list straight to profile. */
  hasLocationLayer: boolean;
  /** Pre/Probation show their sections as in-page tabs on one URL; Onboarding/Active/Exit are separate routed pages per section. */
  profileMode: "in-page-tabs" | "separate-pages";
  sections: ProfileSection[];
  navRail: NavRailStyle;
}

export interface StageHistoryGroup {
  stage: EmployeeStage;
  sections: ProfileSection[];
}

export const STAGE_PROFILE_CONFIG: Record<EmployeeStage, StageProfileConfig> = {
  pre: {
    hasLocationLayer: false,
    profileMode: "in-page-tabs",
    sections: [
      { key: "personal-info", label: "Personal Info" },
      { key: "resume", label: "Resume" },
      { key: "interview", label: "Interview Assessment" },
      { key: "reference", label: "Reference Check" },
      { key: "medical", label: "Medical Check" },
    ],
    navRail: {
      widthPx: 220,
      gapPx: 12,
      paddingClass: RAIL_PILL_PADDING_CLASS,
      fontSizeClass: RAIL_PILL_FONT_SIZE_CLASS,
      base: "bg-[#d9a2fba8] border-[#b95af4] text-[#4b4949d6]",
      current: "bg-[#d9a2fb] border-[#621096] text-[#4b4949d6]",
    },
  },
  probation: {
    hasLocationLayer: false,
    profileMode: "in-page-tabs",
    sections: [{ key: "probation", label: "Probation" }],
    navRail: {
      widthPx: 220,
      gapPx: 12,
      paddingClass: RAIL_PILL_PADDING_CLASS,
      fontSizeClass: RAIL_PILL_FONT_SIZE_CLASS,
      base: "bg-[#d9a2fba8] border-[#b95af4] text-[#4b4949d6]",
      current: "bg-[#6fa3f0d0] border-[#1f5fce] text-[#4b4949d6]",
    },
  },
  onboarding: {
    hasLocationLayer: true,
    profileMode: "separate-pages",
    sections: [
      { key: "documents", label: "Documents" },
      { key: "payroll", label: "Payroll" },
      { key: "emergency-contact", label: "Emergency Contact" },
    ],
    navRail: {
      widthPx: 200,
      gapPx: 12,
      paddingClass: RAIL_PILL_PADDING_CLASS,
      fontSizeClass: RAIL_PILL_FONT_SIZE_CLASS,
      base: "bg-[#b0ffbfa8] border-[#0a6e03] text-[#4b4949d6]",
      current: "bg-[#7ef293] border-[#0a6e03] text-[#4b4949d6]",
    },
  },
  active: {
    hasLocationLayer: true,
    profileMode: "separate-pages",
    sections: [
      { key: "salary-revision", label: "Salary Revision" },
      { key: "mc-leave", label: "MC/ Leave" },
      { key: "achievement", label: "Achievement" },
      { key: "promotion", label: "Promotion" },
      { key: "transfer", label: "Transfer" },
      { key: "training", label: "Training" },
      { key: "nda", label: "NDA" },
      { key: "non-compete", label: "Non-Compete" },
      { key: "disciplinary", label: "Disciplinary" },
    ],
    navRail: {
      widthPx: 200,
      gapPx: 10,
      paddingClass: RAIL_PILL_PADDING_CLASS,
      fontSizeClass: RAIL_PILL_FONT_SIZE_CLASS,
      base: "bg-[#d9fd63a8] border-[#b4da37] text-[#4b4949d6]",
      current: "bg-[#c8e94a] border-[#7a9c1f] text-[#4b4949d6]",
    },
  },
  exit: {
    hasLocationLayer: true,
    profileMode: "separate-pages",
    sections: [
      { key: "resignation", label: "Resignation" },
      { key: "knowledge-transfer", label: "Knowledge Transfer", group: "Clearance" },
      { key: "asset-recovery", label: "Asset Recovery", group: "Clearance" },
      { key: "system-revocation", label: "System Revocation", group: "Clearance" },
      { key: "financial-settlement", label: "Financial Settlement", group: "Clearance" },
      { key: "reference-letter", label: "Reference Letter" },
      { key: "exit-interview-notes", label: "Exit Interview Notes" },
    ],
    navRail: {
      widthPx: 210,
      gapPx: 10,
      paddingClass: RAIL_PILL_PADDING_CLASS,
      fontSizeClass: RAIL_PILL_FONT_SIZE_CLASS,
      base: "bg-[#f48e8ea8] border-[#ee5f5f] text-[#4b4949d6]",
      current: "bg-[#ee5f5f] border-[#961010] text-white",
      clearanceBase: "bg-[#ffe29aa8] border-[#e8a93c] text-[#4b4949d6]",
      clearanceCurrent: "bg-[#e8a93c] border-[#8a5a06] text-white",
    },
  },
};

// Builds the profile URL for a given stage — "in-page-tabs" stages (Pre/
// Probation) have no section segment, "separate-pages" stages (Onboarding/
// Active/Exit) land on their first section. Used to send a real stage-move
// action (Proceed, or Probation's Confirm decision — see ProbationPanel in
// ActiveProfilePanels.tsx) straight to the employee's new profile,
// whichever URL shape that target stage actually uses. Lives here rather
// than in StageProfileView.tsx (its original home) because ProbationPanel
// needs it too, and StageProfileView.tsx itself imports FROM
// ActiveProfilePanels.tsx — importing back the other way would be circular.
export function profileUrlForStage(stage: EmployeeStage, employeeId: number): string {
  const config = STAGE_PROFILE_CONFIG[stage];
  if (config.profileMode === "separate-pages") {
    return `/employee-folder/${stage}/employee/${employeeId}/${config.sections[0].key}`;
  }
  return `/employee-folder/${stage}/employee/${employeeId}`;
}

// Cumulative history shown above each stage's card (Emp_Folder duplicates
// every prior stage's own panel markup inline and switches between them via
// radio-button tabs — bookmark-tabs on Probation, top-tabs on Onboarding/
// Active, collapsible stage-tiles on Exit). Confirmed via js/stage-transition.js
// that the stage path itself (Pre -> Probation -> Onboarding -> Active -> Exit)
// doesn't branch by employment type — only one resolveTarget per stage's own
// proceed script, no position/branch/dept gating on which stage comes next.
export const STAGE_HISTORY_GROUPS: Record<EmployeeStage, StageHistoryGroup[]> = {
  pre: [],
  probation: [{ stage: "pre", sections: STAGE_PROFILE_CONFIG.pre.sections }],
  onboarding: [
    { stage: "pre", sections: STAGE_PROFILE_CONFIG.pre.sections },
    { stage: "probation", sections: STAGE_PROFILE_CONFIG.probation.sections },
  ],
  active: [
    { stage: "pre", sections: STAGE_PROFILE_CONFIG.pre.sections },
    { stage: "probation", sections: STAGE_PROFILE_CONFIG.probation.sections },
    { stage: "onboarding", sections: STAGE_PROFILE_CONFIG.onboarding.sections },
  ],
  exit: [
    { stage: "pre", sections: STAGE_PROFILE_CONFIG.pre.sections },
    { stage: "probation", sections: STAGE_PROFILE_CONFIG.probation.sections },
    { stage: "onboarding", sections: STAGE_PROFILE_CONFIG.onboarding.sections },
    { stage: "active", sections: STAGE_PROFILE_CONFIG.active.sections },
  ],
};

// Exact "move to next stage" button labels lifted from each stage's own
// proceed button markup (pre-proceed-btn/onboarding-next-btn/active-exit-
// btn) — Exit is terminal, no button. Probation deliberately has no entry
// here anymore — its own "Next" button (nextStage: "onboarding",
// proceedFromProbation) was removed as redundant, per explicit decision
// (see conversation): the Confirm decision button already achieves the same
// visible effect (isEffectivelyConfirmed treats probation_status
// "Confirmed" as Active immediately, no separate proceed step needed).
export const STAGE_PROCEED_BUTTON: Partial<Record<EmployeeStage, { label: string; nextStage: EmployeeStage }>> = {
  pre: { label: "Proceed", nextStage: "probation" },
  onboarding: { label: "Next", nextStage: "active" },
  active: { label: "Exit", nextStage: "exit" },
};

// Exact per-originating-stage colors for the cumulative history tabs (.top-tab/
// .top-tab--probation/.top-tab--onboarding/.top-tab--active-stage and the Exit
// stage-tiles' dot bars), lifted verbatim from active_salaryRev.css/
// exit_resignation.css. The "selected" state isn't part of this table — every
// page overrides whichever tab is currently open with that PAGE's own
// navRail.current color (blue on Probation, lime on Active, red on Exit),
// confirmed via each stage's own CSS `#tab-X:checked ~ .page label[for=...]`
// rule using its own accent, not a fixed color.
export const STAGE_HISTORY_TAB_STYLE: Partial<Record<EmployeeStage, { base: string; hoverBg: string }>> = {
  pre: { base: "bg-[#d9a2fba8] border-[#b95af4]", hoverBg: "#d9a2fb" },
  probation: { base: "bg-[#90aeeea8] border-[#5388f9]", hoverBg: "#90aeee" },
  onboarding: { base: "bg-[#67eab37d] border-[#55c999]", hoverBg: "#67eab3" },
  active: { base: "bg-[#d9fd63a8] border-[#b4da37]", hoverBg: "#d9fd63" },
};

// Abbreviated labels for the history-tab strip only (top-tabs/bookmark-tabs/
// stage-tiles-expanded) — copied verbatim from onboarding_document.html/
// exit_resignation.html's own <label> text ("P. Info", "Interv. Ass", etc).
// Every other place a section's label appears (vertical nav rail, panel
// headings, breadcrumbs) keeps the full ProfileSection.label — full names
// were a deliberate earlier choice there for clarity, this map only affects
// the compact history strip where the mock itself abbreviates. Sections not
// listed here (Probation's own, Active's 9) are already short in the mock
// and use their normal label unchanged.
export const HISTORY_TAB_LABEL: Record<string, string> = {
  "personal-info": "P. Info",
  resume: "Resume",
  interview: "Interv. Ass",
  reference: "Ref",
  medical: "Med. C",
  documents: "Doc.",
  payroll: "Payroll",
  "emergency-contact": "Emergency",
};
