"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

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
  children: ReactNode;
}

export function EditableSection({ onSave, hasRealBacking = true, canEdit = true, children }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleClick() {
    if (!editing) {
      setEditing(true);
      setNotice(null);
      return;
    }
    setSaving(true);
    let result: SaveResult;
    try {
      result = onSave ? await onSave() : undefined;
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : "Save failed" };
    }
    setSaving(false);
    setEditing(false);

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
        {canEdit && (
          <button
            type="button"
            onClick={handleClick}
            disabled={saving}
            className="absolute top-0 right-0 z-10 min-h-11 rounded-full border-2 border-[#4a90e2] bg-white px-5 py-2 text-sm font-medium text-[#4a90e2] hover:bg-[#eef4fd] disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {saving ? "Saving…" : editing ? "Save" : "Edit"}
          </button>
        )}
        {notice && (
          <div
            role="status"
            className="absolute top-11 right-0 z-10 max-w-[260px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-lg"
          >
            {notice}
          </div>
        )}
        {children}
      </div>
    </EditModeContext.Provider>
  );
}
