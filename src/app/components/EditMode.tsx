"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePageEditContext, type ValidationResult } from "@/app/components/PageEditMode";

// Exact behavior from Emp_Folder's js/edit-mode.js: ONE button that toggles
// Edit -> Save (not two separate buttons), no Cancel, no built-in success
// message — the mock silently writes to localStorage and flips the label
// back. The "not persisted" notice below is an intentional addition (not in
// the mock) since the user asked to be told, not silently no-op, when a
// field has no real column to save to.
const EditModeContext = createContext(false);
export function useEditMode() {
  return useContext(EditModeContext);
}

export type SaveResult = { ok: boolean; error?: string } | void;

interface Props {
  onSave?: () => Promise<SaveResult> | SaveResult;
  /** false when some/all fields in this section have no matching DB column yet. */
  hasRealBacking?: boolean;
  /** false hides the Edit/Save toggle entirely (view-only) — e.g. a CEO
   *  viewing someone else's profile in Employee Folder, where the
   *  server-side guard in employeeRecordActions.ts already blocks the save;
   *  this just avoids showing a button that would only ever 403. Defaults
   *  true so every existing caller keeps its current behavior unchanged. */
  canEdit?: boolean;
  /** Pre-save validation, checked BEFORE onSave — only consulted when this
   *  section renders inside a PageEditProvider (see PageEditMode.tsx); a
   *  standalone EditableSection still relies on onSave's own inline checks,
   *  same as before this prop existed. Optional — a section with nothing to
   *  check can omit it. */
  validate?: () => ValidationResult;
  /** Required only when this section will ever render inside a
   *  PageEditProvider — the registration key, and the label shown in that
   *  provider's aggregated validation/save error messages. Ignored in
   *  standalone mode. */
  sectionLabel?: string;
  children: ReactNode;
}

export function EditableSection({ onSave, hasRealBacking = true, canEdit = true, validate, sectionLabel, children }: Props) {
  const pageEdit = usePageEditContext();
  const [localEditing, setLocalEditing] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Registers this section's current save/validate with the page-level
  // orchestrator when one is present. Deliberately no dependency array —
  // re-registers on every render so the registry always holds a closure
  // over this render's field values (they change on every keystroke), not
  // a stale snapshot from first mount. Cheap (a Map.set), and the cleanup
  // removes the entry on unmount so a tab that's no longer visited doesn't
  // linger in the registry — no-op when pageEdit is null (standalone mode).
  useEffect(() => {
    if (!pageEdit || !sectionLabel) return;
    pageEdit.register(sectionLabel, {
      label: sectionLabel,
      validate,
      save: async () => (onSave ? await onSave() : undefined),
    });
    return () => pageEdit.unregister(sectionLabel);
  });

  const editing = pageEdit ? pageEdit.isEditing : localEditing;
  const saving = pageEdit ? pageEdit.saving : localSaving;

  // Standalone mode only — inside a PageEditProvider, PageEditToggleButton
  // is the one button, and its click handler (in PageEditMode.tsx) is what
  // calls onSave/validate via the registry above, not this.
  async function handleClick() {
    if (!editing) {
      setLocalEditing(true);
      setNotice(null);
      return;
    }
    setLocalSaving(true);
    let result: SaveResult;
    try {
      result = onSave ? await onSave() : undefined;
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : "Save failed" };
    }
    setLocalSaving(false);
    setLocalEditing(false);

    if (result && result.ok === false) {
      setNotice(result.error ?? "Save failed.");
    } else if (!hasRealBacking) {
      setNotice("Not saved to a real record — this section has no database column yet.");
    } else {
      setNotice("Saved.");
    }
    setTimeout(() => setNotice(null), 5000);
  }

  return (
    <EditModeContext.Provider value={editing}>
      <div className="relative">
        {canEdit && !pageEdit && (
          <button
            type="button"
            onClick={handleClick}
            disabled={saving}
            className="absolute top-0 right-0 z-10 min-h-11 rounded-full border-2 border-[#4a90e2] bg-white dark:bg-slate-900 px-5 py-2 text-sm font-medium text-[#4a90e2] hover:bg-[#eef4fd] dark:hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {saving ? "Saving…" : editing ? "Save" : "Edit"}
          </button>
        )}
        {notice && !pageEdit && (
          <div
            role="status"
            className="absolute top-11 right-0 z-10 max-w-[260px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 shadow-lg"
          >
            {notice}
          </div>
        )}
        {children}
      </div>
    </EditModeContext.Provider>
  );
}
