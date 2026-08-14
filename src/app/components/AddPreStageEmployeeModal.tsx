"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { POSITION_OPTIONS } from "@/lib/employeeStages";
import { addPreStageEmployee } from "@/lib/employeeRecordActions";
import type { BranchOpt, DepartmentOpt } from "@/lib/employeeQueries";

const inputClass =
  "h-11 rounded-[10px] bg-[#f0f0f0a6] border-0 px-3.5 text-sm text-[#4b4949] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50";

// Position options are scoped by whether Branch or Department was picked
// (2026-08-13, see conversation) — a Branch hire is always operational
// (Coach/BM), a Department hire is always HQ-side (Exec/HOD), and Intern is
// the one position both sides share. CEO is its own department_code (real
// row, confirmed via direct query — not a placeholder) with no other valid
// position, so it's handled as its own locked case below rather than a
// third options list.
const BRANCH_POSITION_VALUES = ["PT COACH", "FT COACH", "INTERN", "BM"];
const DEPARTMENT_POSITION_VALUES = ["FT EXEC", "FT HOD", "INTERN"];
const BRANCH_POSITION_OPTIONS = POSITION_OPTIONS.filter((o) => BRANCH_POSITION_VALUES.includes(o.value));
const DEPARTMENT_POSITION_OPTIONS = POSITION_OPTIONS.filter((o) => DEPARTMENT_POSITION_VALUES.includes(o.value));

interface Props {
  branches: BranchOpt[];
  departments: DepartmentOpt[];
}

// Creates a real employee (users + user_profile + employment, one user_id) —
// not the old localStorage-only/candidate-row behavior. Once saved, this
// person is a real portal account and shows up as a normal clickable Pre
// stage row, same as any other real employee.
export default function AddPreStageEmployeeModal({ branches, departments }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [departmentCode, setDepartmentCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCeoDepartment = departmentCode === "CEO";
  const positionOptions = isCeoDepartment
    ? POSITION_OPTIONS.filter((o) => o.value === "CEO")
    : branchCode
      ? BRANCH_POSITION_OPTIONS
      : departmentCode
        ? DEPARTMENT_POSITION_OPTIONS
        : [];

  function reset() {
    setFullName("");
    setPosition("");
    setBranchCode("");
    setDepartmentCode("");
    setStartDate("");
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await addPreStageEmployee({ fullName, position, branchCode, departmentCode, startDate });
    if (!result.ok) {
      setError(result.error ?? "Failed to add employee.");
      setSaving(false);
      return;
    }
    setSaving(false);
    close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 px-5 rounded-full bg-[#63f4aea8] text-sm font-bold text-[#17643c] hover:bg-[#63f4ae] transition-colors"
      >
        + Add
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="relative flex w-full max-w-[480px] max-h-[calc(100vh-32px)] flex-col box-border bg-white rounded-2xl shadow-[0_12px_32px_0_#00000026] overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-5 sm:px-7 pt-6 pb-4">
              <h3 className="text-lg font-semibold text-[#4b4949d6]">Add Pre-stage Employee</h3>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-[#4b4949a3] hover:bg-[#f0f4fa] hover:text-[#4b4949]"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 sm:px-7">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[#4b4949]">Full Name</label>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
                </div>

                <p className="text-xs text-slate-500 -mb-2">Branch and Department — select only one; choosing one clears the other.</p>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[#4b4949]">Branch</label>
                  <select
                    value={branchCode}
                    onChange={(e) => {
                      const value = e.target.value;
                      setBranchCode(value);
                      if (value) setDepartmentCode("");
                      // Position resets whenever Branch/Department switches
                      // (2026-08-13, see conversation) — the valid option set
                      // is different for each side, so a previously-picked
                      // Position may no longer be valid.
                      setPosition("");
                    }}
                    disabled={Boolean(departmentCode)}
                    className={inputClass}
                  >
                    <option value=""></option>
                    {branches.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[#4b4949]">Dept</label>
                  <select
                    value={departmentCode}
                    onChange={(e) => {
                      const value = e.target.value;
                      setDepartmentCode(value);
                      if (value) setBranchCode("");
                      // CEO is a real department_code (confirmed via direct
                      // query, not a placeholder) with no other valid
                      // position — auto-lock Position to it instead of
                      // clearing to blank, same as every other Dept pick
                      // resets Position for its own (different) option set.
                      setPosition(value === "CEO" ? "CEO" : "");
                    }}
                    disabled={Boolean(branchCode)}
                    className={inputClass}
                  >
                    <option value=""></option>
                    {departments.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[#4b4949]">Position</label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    disabled={isCeoDepartment}
                    className={inputClass}
                  >
                    <option value=""></option>
                    {positionOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[#4b4949]">Date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
                </div>
              </div>

              {error && <p className="mt-4 text-xs text-red-600">{error}</p>}
            </div>

            <div className="flex shrink-0 justify-end gap-3 px-5 sm:px-7 py-4 mt-2 border-t border-black/5">
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="min-h-11 rounded-[10px] px-5 py-2.5 text-sm font-medium text-[#4b4949] hover:bg-slate-100 disabled:opacity-60 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="min-h-11 rounded-[10px] px-6 py-2.5 text-sm font-medium text-white bg-[#4a90e2] hover:bg-[#3a7bc8] disabled:opacity-60 transition-colors"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
