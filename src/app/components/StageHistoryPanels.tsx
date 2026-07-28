"use client";

import type { ComponentType } from "react";
import { EditableSection } from "@/app/components/EditMode";
import {
  PanelHeading,
  FieldGrid,
  Checklist,
  PlaceholderField,
  PlaceholderSelectField,
  PlaceholderTextArea,
  PlaceholderUploadField,
} from "@/app/components/ActiveProfilePanels";

// Content for the Pre/Probation/Onboarding(Documents+Payroll)/Exit sections —
// none of these have a matching column anywhere in the real schema (Pre-stage
// candidates aren't even fully onboarded `user_profile`/employment rows yet),
// so every panel here is a placeholder wrapped in EditableSection
// hasRealBacking={false}, using the shared label-above/value-below field
// primitives (PlaceholderField/PlaceholderSelectField/PlaceholderTextArea/
// PlaceholderUploadField) so it matches the rest of the app's inner-card
// styling. Fields/labels/options are copied verbatim from each stage's own
// Emp_Folder HTML (pre_PersonalInfo.html, probation_profile.html,
// onboarding_document.html, onboarding_payroll.html, exit_*.html) — these
// same components double as both a stage's own current-section content AND
// the history entry shown from every later stage.
//
// Fields that would need a real column to stop being placeholders: literally
// everything below — Pre/Probation/Onboarding-Documents/Onboarding-Payroll/
// Exit have no backing tables in the current schema at all (no candidate
// interview/reference/medical tables, no probation-detail columns beyond
// employment.probation's boolean, no documents/payroll-intake tables, no
// resignation/clearance/reference-letter/exit-interview tables).

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

// ─── Exit's 7 sections ───

export function ResignationPanel() {
  return (
    <EditableSection hasRealBacking={false}>
      <PanelHeading>Resignation</PanelHeading>
      <FieldGrid>
        <PlaceholderField label="Submission Date" type="date" />
        <PlaceholderField label="Last Working Date" type="date" />
        <PlaceholderTextArea label="Reason" />
        <PlaceholderUploadField label="Resignation Letter" />
        <PlaceholderUploadField label="Acceptance Letter" />
      </FieldGrid>
    </EditableSection>
  );
}

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

export function ReferenceLetterPanel() {
  return (
    <EditableSection hasRealBacking={false}>
      <PanelHeading>Reference Letter</PanelHeading>
      <FieldGrid>
        <PlaceholderField label="Request Date" type="date" />
        <PlaceholderSelectField label="Letter Type" options={["Employment Confirmation", "Character Reference", "Service / Experience Letter"]} />
        <PlaceholderField label="Issued Date" type="date" />
        <PlaceholderField label="Issued By" />
        <PlaceholderTextArea label="Remarks" />
        <PlaceholderUploadField label="Issued Letter" />
      </FieldGrid>
    </EditableSection>
  );
}

export function ExitInterviewNotesPanel() {
  return (
    <EditableSection hasRealBacking={false}>
      <PanelHeading>Exit Interview Notes</PanelHeading>
      <FieldGrid>
        <PlaceholderField label="Interview Date" type="date" />
        <PlaceholderField label="Interviewer" />
        <PlaceholderSelectField
          label="Primary Reason for Leaving"
          options={["Career Advancement", "Compensation", "Relocation", "Personal Reasons", "Other"]}
          full
        />
        <PlaceholderTextArea label="Feedback / Notes" />
      </FieldGrid>
    </EditableSection>
  );
}

// Flat lookup by section key — every key here is unique across all 5 stages'
// own sections, so one map covers Pre/Probation/Onboarding/Exit content
// regardless of whether it's being shown as the current stage's own section
// or as history from a later stage. "emergency-contact", "personal-info",
// "resume", "interview", "reference", "medical", "probation", "documents",
// and "payroll" are deliberately absent — all nine are real, special-cased
// directly in StageProfileView's resolvePanel() (ActiveProfilePanels.
// EmergencyContactPanel/PersonalInfoPanel/ResumePanel/
// InterviewAssessmentPanel/ReferenceCheckPanel/MedicalCheckPanel/
// ProbationPanel/DocumentsPanel/OnboardingPayrollPanel) instead of living
// here as placeholders.
export const STAGE_CONTENT_PANELS: Record<string, ComponentType> = {
  resignation: ResignationPanel,
  "knowledge-transfer": KnowledgeTransferPanel,
  "asset-recovery": AssetRecoveryPanel,
  "system-revocation": SystemRevocationPanel,
  "financial-settlement": FinancialSettlementPanel,
  "reference-letter": ReferenceLetterPanel,
  "exit-interview-notes": ExitInterviewNotesPanel,
};
