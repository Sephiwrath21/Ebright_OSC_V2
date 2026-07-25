"use client";

// OSC integration package — the assign-task recipient picker: a two-card
// menu ("Person" / "Group"). Clicking a card replaces the menu with that
// mode's full picker — a search bar or group dropdown, each narrowing a
// custom multi-select dropdown (MemberDropdown, NOT a native <select> —
// those close on every pick). Clicking a name toggles it in/out of the
// selection and the dropdown STAYS OPEN, so several people can be picked in
// a row; it only closes on outside-click, Escape, or its own "Done" row. The
// other menu card is hidden until "← Back" returns to the menu. Selections
// persist across mode switches (the "Selected" chip summary is always
// visible) and both modes always feed the same selected-id array.

import * as React from "react";
import {
  FLOW_DEPARTMENTS,
  FLOW_GROUP_DEPT_NONE,
  FLOW_GROUPS,
  FLOW_GROUPS_NEEDING_SUBVALUE,
  FLOW_GROUPS_WITH_OPTIONAL_DEPARTMENT,
  flowGroupMembers,
  type FlowGroup,
  type FlowStaffMember,
} from "./types";

const selectClass =
  "w-full appearance-none rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none";

function chipClass(active: boolean): string {
  return `rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
    active ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
  }`;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3">
      <path
        d="M3 8.5L6.5 12L13 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Custom multi-select dropdown (not a native <select> — those close on
 *  every pick, which is exactly the bad UX this replaces). Click to open;
 *  each row toggles that person in/out of the selection and the list STAYS
 *  OPEN, so several people can be picked in a row without reopening it.
 *  Closes on outside-click, Escape, or the "Done" row. */
function MemberDropdown({
  members,
  selected,
  onToggle,
  onToggleAll,
  emptyLabel,
  showRole = true,
}: {
  members: FlowStaffMember[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  emptyLabel: string;
  showRole?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (members.length === 0) {
    return <p className="text-xs text-gray-400">{emptyLabel}</p>;
  }

  const allSelected = members.every((m) => selected.has(m.id));
  const selectedCount = members.filter((m) => selected.has(m.id)).length;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${selectClass} flex items-center justify-between gap-2`}
      >
        <span className={selectedCount > 0 ? "text-gray-700" : "text-gray-400"}>
          {selectedCount > 0 ? `${selectedCount} selected` : "Select people…"}
        </span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => onToggleAll(members.map((m) => m.id))}
            className="block w-full border-b border-gray-100 px-3 py-1.5 text-left text-xs font-semibold text-blue-600 hover:bg-blue-50"
          >
            {allSelected ? "Deselect all" : `Select all (${members.length})`}
          </button>
          {members.map((m) => {
            const isSelected = selected.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onToggle(m.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${
                  isSelected ? "bg-blue-50 text-blue-700" : "text-gray-700"
                }`}
              >
                <span
                  className={`flex size-3.5 shrink-0 items-center justify-center rounded border ${
                    isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300"
                  }`}
                >
                  {isSelected && <CheckIcon />}
                </span>
                <span className="truncate">
                  {m.name}
                  {showRole && m.employmentType ? ` · ${m.employmentType}` : ""}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="block w-full border-t border-gray-100 px-3 py-1.5 text-center text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function MenuCard({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-50"
    >
      <p className="text-sm font-semibold text-gray-700">{label}</p>
      <p className="mt-0.5 text-xs text-gray-400">{hint}</p>
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 text-xs font-medium text-blue-600 hover:text-blue-700"
    >
      ← Back
    </button>
  );
}

type PickerView = "menu" | "person" | "group";

/**
 * Recipient picker shared by every "+ Assigned task" flow: a "Person" /
 * "Group" menu, each opening full-width in place of the other. Picks from
 * either mode merge into the same `selected` id array.
 */
export function RecipientPicker({
  staff,
  selected,
  onChange,
  restrictToGroup,
}: {
  staff: FlowStaffMember[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Hard-restricts recipients to ONE group — skips the Person/Group menu
   *  entirely and shows only that group's members (no way to pick anyone
   *  else). Used where the caller must ONLY ever target one role, e.g. the
   *  CEO's "+ Add Task" form (HODs only). Omit for the normal, fully
   *  flexible Person + any-Group picker. */
  restrictToGroup?: FlowGroup;
}) {
  const [view, setView] = React.useState<PickerView>("menu");
  const [search, setSearch] = React.useState("");
  const [group, setGroup] = React.useState<FlowGroup | "">("");
  const [groupSub, setGroupSub] = React.useState("");

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  const toggle = (id: string) => {
    onChange(selectedSet.has(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };
  /** "Select all" if any of `ids` aren't yet selected; "Deselect all" (only
   *  these `ids`, leaving unrelated selections from other pickers alone) if
   *  every one of them already is. */
  const toggleAll = (ids: string[]) => {
    const allSelected = ids.every((id) => selectedSet.has(id));
    onChange(
      allSelected
        ? selected.filter((id) => !ids.includes(id))
        : [...selected, ...ids.filter((id) => !selectedSet.has(id))],
    );
  };

  const searched = search.trim().toLowerCase();
  const personResults = staff
    .filter((s) => s.name.toLowerCase().includes(searched))
    .sort((a, b) => a.name.localeCompare(b.name));

  const groupValue: FlowGroup | null = restrictToGroup ?? (group === "" ? null : group);
  const needsSub = groupValue !== null && FLOW_GROUPS_NEEDING_SUBVALUE.includes(groupValue);
  // Optional department narrowing (e.g. "Intern → Operation") — renders the
  // same department dropdown, but an empty pick means "All departments"
  // rather than blocking the member list.
  const optionalDeptSub =
    groupValue !== null && FLOW_GROUPS_WITH_OPTIONAL_DEPARTMENT.includes(groupValue);
  const groupResults =
    groupValue !== null && (!needsSub || groupSub)
      ? flowGroupMembers(staff, groupValue, groupSub)
      : [];

  const selectedSummary = selected.length > 0 && (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500">Selected ({selected.length})</p>
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs font-medium text-gray-400 hover:text-gray-600"
        >
          Clear all
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {selected.map((id) => {
          const m = staff.find((s) => s.id === id);
          if (!m) return null;
          return (
            <button key={id} type="button" onClick={() => toggle(id)} className={chipClass(true)}>
              {m.name} ×
            </button>
          );
        })}
      </div>
    </div>
  );

  if (restrictToGroup) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          {(needsSub || optionalDeptSub) && (
            <select
              value={groupSub}
              onChange={(e) => setGroupSub(e.target.value)}
              className={`mb-2 ${selectClass}`}
            >
              <option value="">{needsSub ? "Select a department…" : "All departments"}</option>
              {FLOW_DEPARTMENTS.map((v) => (
                <option key={v}>{v}</option>
              ))}
              {optionalDeptSub && (
                <option value={FLOW_GROUP_DEPT_NONE}>{FLOW_GROUP_DEPT_NONE}</option>
              )}
            </select>
          )}
          {needsSub && !groupSub ? (
            <p className="text-xs text-gray-400">Pick a department above.</p>
          ) : (
            <MemberDropdown
              members={groupResults}
              selected={selectedSet}
              onToggle={toggle}
              onToggleAll={toggleAll}
              emptyLabel={`No ${restrictToGroup.toLowerCase()} staff found.`}
            />
          )}
        </div>
        {selectedSummary}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {view === "menu" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <MenuCard label="Person" hint="Search staff by name" onClick={() => setView("person")} />
          <MenuCard label="Group" hint="Filter by role or department" onClick={() => setView("group")} />
        </div>
      )}

      {view === "person" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          <BackButton onClick={() => setView("menu")} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff by name…"
            className="mb-2 w-full rounded-full border border-gray-300 px-3 py-1.5 text-xs placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
          <MemberDropdown
            members={personResults}
            selected={selectedSet}
            onToggle={toggle}
            onToggleAll={toggleAll}
            emptyLabel="No staff match that search."
            showRole={false}
          />
        </div>
      )}

      {view === "group" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          <BackButton onClick={() => setView("menu")} />
          <select
            value={group}
            onChange={(e) => {
              setGroup(e.target.value as FlowGroup | "");
              setGroupSub("");
            }}
            className={`mb-2 ${selectClass}`}
          >
            <option value="">Select a group…</option>
            {FLOW_GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>

          {(needsSub || optionalDeptSub) && groupValue !== null && (
            <select
              value={groupSub}
              onChange={(e) => setGroupSub(e.target.value)}
              className={`mb-2 ${selectClass}`}
            >
              <option value="">{needsSub ? "Select a department…" : "All departments"}</option>
              {FLOW_DEPARTMENTS.map((v) => (
                <option key={v}>{v}</option>
              ))}
              {optionalDeptSub && (
                <option value={FLOW_GROUP_DEPT_NONE}>{FLOW_GROUP_DEPT_NONE}</option>
              )}
            </select>
          )}

          {groupValue === null ? (
            <p className="text-xs text-gray-400">Pick a group to see staff.</p>
          ) : needsSub && !groupSub ? (
            <p className="text-xs text-gray-400">Pick a department above.</p>
          ) : (
            <MemberDropdown
              members={groupResults}
              selected={selectedSet}
              onToggle={toggle}
              onToggleAll={toggleAll}
              emptyLabel="No staff in this group yet."
            />
          )}
        </div>
      )}

      {selectedSummary}
    </div>
  );
}
