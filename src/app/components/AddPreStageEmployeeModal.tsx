"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { POSITION_OPTIONS } from "@/lib/employeeStages";
import { addPreStageEmployee } from "@/lib/employeeRecordActions";
import type { BranchOpt, DepartmentOpt } from "@/lib/employeeQueries";

const inputClass =
  "h-11 rounded-[10px] bg-[#f0f0f0a6] border-0 px-3.5 text-sm text-[#4b4949] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50";

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
        className="h-10 px-5 rounded-full bg-[#63f4aea8] text-sm font-bold text-[#17643c] hover:bg-[#63f4ae] transition-colors"
      >
        + Add
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="relative w-[min(480px,calc(100vw-48px))] max-h-[calc(100vh-64px)] overflow-y-auto box-border bg-white rounded-2xl p-7 shadow-[0_12px_32px_0_#00000026]">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute top-5 right-6 text-lg text-[#4b4949a3] hover:text-[#4b4949]"
            >
              ×
            </button>
            <h3 className="mb-5 text-lg font-semibold text-[#4b4949d6]">Add Pre-stage Employee</h3>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-[#4b4949]">Full Name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-[#4b4949]">Position</label>
                <select value={position} onChange={(e) => setPosition(e.target.value)} className={inputClass}>
                  <option value=""></option>
                  {POSITION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-[#4b4949]">Branch</label>
                <select
                  value={branchCode}
                  onChange={(e) => {
                    setBranchCode(e.target.value);
                    if (e.target.value) setDepartmentCode("");
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
                    setDepartmentCode(e.target.value);
                    if (e.target.value) setBranchCode("");
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
                <label className="text-sm font-medium text-[#4b4949]">Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
              </div>
            </div>

            {error && <p className="mt-4 text-xs text-red-600">{error}</p>}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                className="rounded-[10px] px-5 py-2.5 text-sm font-medium text-[#4b4949] hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="rounded-[10px] px-6 py-2.5 text-sm font-medium text-white bg-[#4a90e2] hover:bg-[#3a7bc8] disabled:opacity-60 transition-colors"
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
