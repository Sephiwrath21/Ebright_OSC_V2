"use client";

import type { ComponentType } from "react";
import { EditableSection } from "@/app/components/EditMode";
import {
  PanelHeading,
  FieldGrid,
  Checklist,
  PlaceholderField,
  PlaceholderTextArea,
  PlaceholderUploadField,
} from "@/app/components/ActiveProfilePanels";

// Content for the Pre/Probation/Onboarding(Documents+Payroll)/Exit-Clearance
// sections — none of these have a matching column anywhere in the real
// schema (Pre-stage candidates aren't even fully onboarded `user_profile`/
// employment rows yet), so every panel here is a placeholder wrapped in
// EditableSection hasRealBacking={false}, using the shared label-above/
// value-below field primitives (PlaceholderField/PlaceholderSelectField/
// PlaceholderTextArea/PlaceholderUploadField) so it matches the rest of the
// app's inner-card styling. Fields/labels/options are copied verbatim from
// each stage's own Emp_Folder HTML (pre_PersonalInfo.html,
// probation_profile.html, onboarding_document.html, onboarding_payroll.html,
// exit_C*.html) — these same components double as both a stage's own
// current-section content AND the history entry shown from every later stage.
//
// Fields that would need a real column to stop being placeholders: literally
// everything below — Pre/Probation/Onboarding-Documents/Onboarding-Payroll/
// Exit's 4 Clearance sub-tabs have no backing tables in the current schema at
// all (no candidate interview/reference/medical tables, no probation-detail
// columns beyond employment.probation's boolean, no documents/payroll-intake
// tables, no clearance-checklist tables). Resignation/Reference Letter/Exit
// Interview Notes are real now — see ActiveProfilePanels.ResignationPanel/
// ReferenceLetterPanel/ExitInterviewNotesPanel, special-cased directly in
// StageProfileView's resolvePanel() instead of living here, since they need
// real userId/data props the placeholders below don't take.

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

// ─── Exit's 4 Clearance sub-tabs (Resignation/Reference Letter/Exit
// Interview Notes are real now — see ActiveProfilePanels above) ───

export function KnowledgeTransferPanel() {
  return (
    <EditableSection hasRealBacking={false}>
      <PanelHeading>Clearance – Knowledge Transfer</PanelHeading>
      <Checklist
        items={[
          "Handover document prepared and shared with successor",
          "Ongoing tasks and projects reassigned",
          "Knowledge transfer session conducted with successor / team",
          "Project files, credentials, and documentation locations shared",
          "Client / vendor contact list handed over to team",
        ]}
      />
    </EditableSection>
  );
}

export function AssetRecoveryPanel() {
  return (
    <EditableSection hasRealBacking={false}>
      <PanelHeading>Clearance – Asset Recovery</PanelHeading>
      <Checklist
        items={[
          "Company laptop / desktop returned",
          "Company mobile phone / SIM returned",
          "Access card / ID badge returned",
          "Uniform / PPE returned",
          "Other company assets (keys, tools, equipment) returned",
        ]}
      />
    </EditableSection>
  );
}

export function SystemRevocationPanel() {
  return (
    <EditableSection hasRealBacking={false}>
      <PanelHeading>Clearance – System Revocation</PanelHeading>
      <Checklist
        items={[
          "Company email account access revoked",
          "VPN / network access revoked",
          "Software licenses and internal system accounts revoked",
          "Building / server room access revoked",
          "Third-party / vendor system accounts revoked",
        ]}
      />
    </EditableSection>
  );
}

export function FinancialSettlementPanel() {
  return (
    <EditableSection hasRealBacking={false}>
      <PanelHeading>Clearance – Financial Settlement</PanelHeading>
      <FieldGrid>
        <PlaceholderField label="Final Pay Date" type="date" />
        <PlaceholderField label="Outstanding Leave Payout" />
        <PlaceholderField label="Outstanding Claims" />
        <PlaceholderField label="Loan / Advance Deduction" />
        <PlaceholderTextArea label="Notes" />
        <PlaceholderUploadField label="Settlement Letter" />
      </FieldGrid>
    </EditableSection>
  );
}

// Flat lookup by section key — every key here is unique across all 5 stages'
// own sections, so one map covers Pre/Probation/Onboarding/Exit content
// regardless of whether it's being shown as the current stage's own section
// or as history from a later stage. "emergency-contact", "personal-info",
// "resume", "interview", "reference", "medical", "probation", "documents",
// "payroll", "resignation", "reference-letter", and "exit-interview-notes"
// are deliberately absent — all twelve are real, special-cased directly in
// StageProfileView's resolvePanel() (ActiveProfilePanels.
// EmergencyContactPanel/PersonalInfoPanel/ResumePanel/
// InterviewAssessmentPanel/ReferenceCheckPanel/MedicalCheckPanel/
// ProbationPanel/DocumentsPanel/OnboardingPayrollPanel/ResignationPanel/
// ReferenceLetterPanel/ExitInterviewNotesPanel) instead of living here as
// placeholders.
export const STAGE_CONTENT_PANELS: Record<string, ComponentType> = {
  "knowledge-transfer": KnowledgeTransferPanel,
  "asset-recovery": AssetRecoveryPanel,
  "system-revocation": SystemRevocationPanel,
  "financial-settlement": FinancialSettlementPanel,
};
