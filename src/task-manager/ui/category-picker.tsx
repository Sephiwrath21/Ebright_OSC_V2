"use client";

// Task Category ("Type") dropdown + inline "+ Add new type" flow
// (2026-08-15) — extracted from assign-task-form.tsx (2026-08-12 original),
// which was the sole user until the Template/Package "New"/"Edit" forms
// needed the exact same picker per-task. Deliberately controlled (`value`/
// `onChange`, `categories` from the caller) rather than owning its own
// "which categories exist" list: a multi-task form renders one instance per
// task, and a category created from any ONE of them needs to show up in
// every sibling instance immediately — only achievable if the caller owns
// that list (via `onCategoryCreated`) rather than each instance keeping its
// own local copy, which is how this component behaved before extraction
// when there was only ever one instance per page.
import * as React from "react";
import type { CreateCategoryResult, FlowCategoryOption } from "./types";

const selectClass =
  "w-full appearance-none rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none";

export function CategoryPicker({
  value,
  onChange,
  categories,
  onCreateCategory,
  onCategoryCreated,
}: {
  /** Selected category id, or "" for uncategorized. */
  value: string;
  onChange: (categoryId: string) => void;
  /** Active categories to list — the caller owns this array so multiple
   *  CategoryPicker instances on one page (e.g. one per task in the
   *  Template/Package form) can share it and stay in sync. */
  categories: FlowCategoryOption[];
  /** Inline "+ Add new type" — the ONLY way to create a category (the
   *  standalone admin page was removed, 2026-08-15). Omit to hide the
   *  option entirely; the caller only passes this for viewers who pass
   *  canManageTaskTemplateGroups. The server re-enforces the same gate
   *  regardless. */
  onCreateCategory?: (name: string) => Promise<CreateCategoryResult>;
  /** Called after a successful inline creation, so the caller can append
   *  the new category to whatever shared `categories` array it passes down
   *  — see this file's header comment. */
  onCategoryCreated?: (category: FlowCategoryOption) => void;
}) {
  const [addingCategory, setAddingCategory] = React.useState(false);
  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [categoryBusy, setCategoryBusy] = React.useState(false);
  const [categoryError, setCategoryError] = React.useState<string | null>(null);

  if (categories.length === 0 && !onCreateCategory) return null;

  const submitNewCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !onCreateCategory) return;
    setCategoryBusy(true);
    setCategoryError(null);
    const result = await onCreateCategory(name);
    setCategoryBusy(false);
    if (!result.ok) {
      setCategoryError(result.message);
      return;
    }
    onCategoryCreated?.({ id: result.id, name: result.name });
    onChange(result.id);
    setAddingCategory(false);
    setNewCategoryName("");
  };

  return (
    <div className="max-w-xl">
      {addingCategory ? (
        <div className="text-sm text-gray-600">
          New type name
          <div className="mt-1 flex items-center gap-2">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Flowghan"
              maxLength={100}
              disabled={categoryBusy}
              className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void submitNewCategory()}
              disabled={categoryBusy || !newCategoryName.trim()}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingCategory(false);
                setNewCategoryName("");
                setCategoryError(null);
              }}
              disabled={categoryBusy}
              className="text-xs font-medium text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {categoryError && <p className="mt-1.5 text-xs text-red-600">{categoryError}</p>}
        </div>
      ) : (
        <label className="text-sm text-gray-600">
          Category
          <select
            value={value}
            onChange={(e) => {
              if (e.target.value === "__add_new__") {
                setAddingCategory(true);
                return;
              }
              onChange(e.target.value);
            }}
            className={`mt-1 ${selectClass}`}
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {onCreateCategory && <option value="__add_new__">+ Add new type</option>}
          </select>
        </label>
      )}
    </div>
  );
}
