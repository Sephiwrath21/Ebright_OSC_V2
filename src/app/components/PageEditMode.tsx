"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import type { SaveResult } from "@/app/components/EditMode";

// Page-level Edit/Save orchestration — pilot for Employee Record's Personal
// Info category (2026-08-13, see conversation). Sits ABOVE several
// EditableSection instances (see EditMode.tsx) that would otherwise each
// have their own independent Edit/Save cycle: while a PageEditProvider is
// present, every EditableSection inside it registers its save/validate here
// instead of rendering its own button, so ONE page-level Edit/Save toggle
// drives all of them together, and a single Save validates every touched
// section before writing anything.
//
// Validation-gated, not full DB-transaction atomicity, per explicit decision
// (see conversation): nothing calls a Server Action until every registered
// section's validate() passes. If a save fails mid-flight AFTER validation
// passed (a rare edge case — network blip, a server-side check the client
// validation didn't catch), already-succeeded sections are NOT rolled back;
// this is an accepted, known limitation for this pilot, not something this
// module tries to solve.

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface PageEditRegistration {
  /** Shown in validation/save error messages ("Personal Info: Full Name
   *  cannot be empty.") and used as the registry key. */
  label: string;
  /** Optional — a section with nothing to check (e.g. free-text fields with
   *  no format constraints) can omit this; it's treated as always valid. */
  validate?: () => ValidationResult;
  save: () => Promise<SaveResult>;
}

interface PageEditContextValue {
  isEditing: boolean;
  saving: boolean;
  message: string | null;
  register: (key: string, reg: PageEditRegistration) => void;
  unregister: (key: string) => void;
  toggle: () => void;
  dismissMessage: () => void;
}

const PageEditContext = createContext<PageEditContextValue | null>(null);

/** Read from inside a panel (see EditMode.tsx's EditableSection) to detect
 *  page-level orchestration — returns null when there's no PageEditProvider
 *  above, in which case the panel's normal standalone Edit/Save behavior
 *  applies unchanged. This is what makes the pilot invisible to every other
 *  usage of the same panel components (e.g. PersonalInfoPanel/
 *  EmergencyContactPanel on the stage-profile flow) — they simply never
 *  render inside a PageEditProvider, so this always returns null there. */
export function usePageEditContext(): PageEditContextValue | null {
  return useContext(PageEditContext);
}

export function PageEditProvider({ children }: { children: ReactNode }) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Ref, not state — registration happens in a render-phase-adjacent effect
  // on every touched panel's render; it must never itself trigger a
  // re-render (that would loop), and the toggle() handler only ever reads
  // it at click time, not during render.
  const registryRef = useRef(new Map<string, PageEditRegistration>());

  function register(key: string, reg: PageEditRegistration) {
    registryRef.current.set(key, reg);
  }
  function unregister(key: string) {
    registryRef.current.delete(key);
  }

  async function toggle() {
    if (!isEditing) {
      setIsEditing(true);
      setMessage(null);
      return;
    }

    // Validate every registered section BEFORE writing anything — all-or-
    // nothing per explicit decision (see conversation): if any section is
    // invalid, show exactly what's wrong and where, and stop here. Nothing
    // below this point runs until the user fixes it and clicks Save again.
    //
    // flatMap, not map+filter — a section's own validate() can report
    // MULTIPLE problems at once (e.g. Guardian Info: guardian 1's phone AND
    // email both invalid), returned as a newline-separated string (see
    // GuardianInfoPanel/PersonalInfoPanel/EmergencyContactPanel's own
    // validate() functions). Splitting and re-prefixing each line with the
    // section's label — rather than prefixing the whole string once — keeps
    // every individual error attributed to its section when a section
    // reports more than one, not just the first line.
    const entries = Array.from(registryRef.current.values());
    const validationErrors = entries.flatMap((reg) => {
      const result = reg.validate?.();
      if (!result || result.valid) return [];
      return (result.error ?? "Invalid")
        .split("\n")
        .filter(Boolean)
        .map((line) => `${reg.label}: ${line}`);
    });

    if (validationErrors.length > 0) {
      setMessage(validationErrors.join("\n"));
      return;
    }

    setSaving(true);
    const saveErrors: string[] = [];
    for (const reg of entries) {
      try {
        const result = await reg.save();
        if (result && result.ok === false) saveErrors.push(`${reg.label}: ${result.error ?? "Save failed."}`);
      } catch (e) {
        saveErrors.push(`${reg.label}: ${e instanceof Error ? e.message : "Save failed."}`);
      }
    }
    setSaving(false);
    setIsEditing(false);
    setMessage(saveErrors.length > 0 ? saveErrors.join(" — ") : "Saved.");
    setTimeout(() => setMessage(null), 6000);
  }

  function dismissMessage() {
    setMessage(null);
  }

  return (
    <PageEditContext.Provider value={{ isEditing, saving, message, register, unregister, toggle, dismissMessage }}>
      {children}
    </PageEditContext.Provider>
  );
}

/** The single page-level Edit/Save button — render once, anywhere inside a
 *  PageEditProvider. Renders nothing outside one. The validation/save
 *  message renders separately (see PageEditMessageDialog below) as a
 *  centered modal rather than living here, since it needs to render at the
 *  page root to overlay everything, not wherever this button happens to sit
 *  in the layout. */
export function PageEditToggleButton() {
  const ctx = usePageEditContext();
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={ctx.toggle}
      disabled={ctx.saving}
      className="min-h-11 rounded-full border-2 border-[#4a90e2] bg-white px-5 py-2 text-sm font-medium text-[#4a90e2] hover:bg-[#eef4fd] disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
    >
      {ctx.saving ? "Saving…" : ctx.isEditing ? "Save" : "Edit"}
    </button>
  );
}

// Centered overlay dialog for the validation/save message — same backdrop +
// centered-card + "×" close pattern as every other modal in this app (e.g.
// RepeatableRecordSection's "+ Add Payslip" modal in ActiveProfilePanels.tsx),
// per explicit decision (see conversation, 2026-08-13): replaces the earlier
// small popover anchored under the Edit/Save button, which read as an easy-
// to-miss corner toast for something the user actually needs to read and
// act on (which tab, which field). Same message content/timing as before —
// only the presentation changed. Dismissible by clicking the backdrop or
// the "×" button, same as every other modal here.
export function PageEditMessageDialog() {
  const ctx = usePageEditContext();
  if (!ctx || !ctx.message) return null;
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) ctx.dismissMessage();
      }}
    >
      <div className="relative flex w-full max-w-[480px] max-h-[calc(100vh-32px)] flex-col box-border bg-white rounded-2xl shadow-[0_12px_32px_0_#00000026] overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 sm:px-7 pt-6 pb-4">
          <h3 className="text-lg font-semibold text-[#4b4949d6]">Save</h3>
          <button
            type="button"
            onClick={ctx.dismissMessage}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-[#4b4949a3] hover:bg-[#f0f4fa] hover:text-[#4b4949]"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 pb-7 text-sm text-[#4b4949] whitespace-pre-line">{ctx.message}</div>
      </div>
    </div>
  );
}
