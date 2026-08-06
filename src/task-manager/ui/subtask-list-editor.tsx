"use client";

// Shared subtask add/remove builder (extracted 2026-08-06 from its two
// near-identical copies in assign-task-form.tsx and template-panels.tsx,
// and now also used by template-group-form.tsx). Add one at a time, ✕ to
// remove, max `max` (default 20, mirrors the server's cap in
// data/templates.ts and data/template-groups.ts). Duplicate titles are
// allowed — they become separate, independently-completable rows, same as
// duplicate tasks.
import * as React from "react";

export function SubtaskListEditor({
  subtasks,
  onChange,
  max = 20,
  showMaxMessage = true,
}: {
  subtasks: string[];
  onChange: (next: string[]) => void;
  max?: number;
  /** Whether to render the "Maximum N subtasks." helper text once the cap
   *  is hit. Defaults to true. template-panels.tsx's TemplateEditPanel
   *  passes false — its pre-extraction original never showed this
   *  message, unlike assign-task-form.tsx's. */
  showMaxMessage?: boolean;
}) {
  const [draft, setDraft] = React.useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed || subtasks.length >= max) return;
    onChange([...subtasks, trimmed]);
    setDraft("");
  };
  const remove = (index: number) => {
    onChange(subtasks.filter((_, i) => i !== index));
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-sm font-medium text-gray-600">Subtasks</p>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Type a subtask..."
          maxLength={200}
          className="min-w-0 flex-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim() || subtasks.length >= max}
          className="shrink-0 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40"
        >
          + Add
        </button>
      </div>
      {subtasks.length > 0 && (
        <ol className="mt-2 space-y-1">
          {subtasks.map((s, i) => (
            <li
              key={`${i}-${s}`}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700"
            >
              <span className="w-5 shrink-0 text-xs text-gray-400">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{s}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove subtask ${s}`}
                className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      {showMaxMessage && subtasks.length >= max && (
        <p className="mt-1.5 text-xs text-gray-400">Maximum {max} subtasks.</p>
      )}
    </div>
  );
}
