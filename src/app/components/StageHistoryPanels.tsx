"use client";

import type { ComponentType } from "react";

// Content for the Pre/Probation/Onboarding(Documents+Payroll) sections —
// none of these have a matching column anywhere in the real schema
// (Pre-stage candidates aren't even fully onboarded `user_profile`/
// employment rows yet), so every panel here is a placeholder wrapped in
// EditableSection hasRealBacking={false}, using the shared label-above/
// value-below field primitives (PlaceholderField/PlaceholderSelectField/
// PlaceholderTextArea/PlaceholderUploadField) so it matches the rest of the
// app's inner-card styling. Fields/labels/options are copied verbatim from
// each stage's own Emp_Folder HTML (pre_PersonalInfo.html,
// probation_profile.html, onboarding_document.html, onboarding_payroll.html)
// — these same components double as both a stage's own current-section
// content AND the history entry shown from every later stage.
//
// Fields that would need a real column to stop being placeholders: whatever
// isn't special-cased in StageProfileView's resolvePanel() yet. Resignation/
// Reference Letter/Exit Interview Notes/Exit's 4 Clearance sub-tabs are all
// real now — see ActiveProfilePanels.ResignationPanel/ReferenceLetterPanel/
// ExitInterviewNotesPanel/KnowledgeTransferPanel/AssetRecoveryPanel/
// SystemRevocationPanel/FinancialSettlementPanel, special-cased directly in
// resolvePanel() instead of living here, since they need real userId/data
// props the placeholders below don't take.

// ─── Pre's 5 sections ───
// Personal Info, Resume, and Interview Assessment are all real now — see
// ActiveProfilePanels.PersonalInfoPanel/ResumePanel/InterviewAssessmentPanel,
// special-cased directly in StageProfileView's resolvePanel() rather than
// living in the flat STAGE_CONTENT_PANELS lookup below, since each needs real
// props the other placeholder panels don't take.

// ─── Onboarding's Documents + Payroll are also real now — see
// ActiveProfilePanels.DocumentsPanel/OnboardingPayrollPanel, special-cased
// directly in StageProfileView's resolvePanel() (Emergency Contact has real
// backing too — see ActiveProfilePanels.EmergencyContactPanel). ───

// Flat lookup by section key — every key here is unique across all 5 stages'
// own sections, so one map covers Pre/Probation/Onboarding content regardless
// of whether it's being shown as the current stage's own section or as
// history from a later stage. Currently empty — every section that used to
// live here (Exit's 4 Clearance sub-tabs) is real now and special-cased
// directly in StageProfileView's resolvePanel() instead; kept as a live
// fallback (not deleted) for whichever section gets a placeholder next.
export const STAGE_CONTENT_PANELS: Record<string, ComponentType> = {};
