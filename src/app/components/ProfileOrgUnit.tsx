"use client";

import { useActionState } from "react";
import { Building2, ChevronRight, CircleCheck, CircleAlert } from "lucide-react";
import { updateOrgUnit, type UpdateOrgUnitResult } from "@/app/profile/actions";

interface Opt { id: number; code: string; name: string }

export default function ProfileOrgUnit({
  branches,
  departments,
  defaultOrgUnit,
  onlyBranches = false,
}: {
  branches: Opt[];
  departments: Opt[];
  defaultOrgUnit: string;
  onlyBranches?: boolean;
}) {
  const [state, formAction, pending] = useActionState<UpdateOrgUnitResult | null, FormData>(updateOrgUnit, null);

  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <header className="flex items-start gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{onlyBranches ? "Assigned Branch" : "Managed Branch / Department"}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {onlyBranches
              ? "Select the branch this account manages. This links your account to the branch (stored in your employment record)."
              : "Select the branch or department you oversee. This is stored in your employment record."}
          </p>
        </div>
      </header>

      <form action={formAction} className="p-6 space-y-4">
        {state?.error && (
          <div role="alert" className="flex items-start gap-2 p-3 rounded-md border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900 text-sm text-red-800 dark:text-red-200">
            <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{state.error}</span>
          </div>
        )}
        {state?.ok && state.message && (
          <div role="status" className="flex items-start gap-2 p-3 rounded-md border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900 text-sm text-emerald-800 dark:text-emerald-200">
            <CircleCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{state.message}</span>
          </div>
        )}

        <label className="block">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
            {onlyBranches ? "Branch" : "Branch / Department"}
            <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
          </span>
          <div className="relative">
            <select
              name="orgUnit"
              defaultValue={defaultOrgUnit}
              required
              className="block w-full h-10 px-3 pr-8 rounded-lg border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer"
            >
              <option value="" disabled>{onlyBranches ? "Select branch" : "Select branch or department"}</option>
              {onlyBranches ? (
                branches.map((b) => (
                  <option key={`b-${b.id}`} value={`branch:${b.id}`}>{b.code} — {b.name}</option>
                ))
              ) : (
                <>
                  <optgroup label="Branches">
                    {branches.map((b) => (
                      <option key={`b-${b.id}`} value={`branch:${b.id}`}>{b.code} — {b.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Departments">
                    {departments.map((d) => (
                      <option key={`d-${d.id}`} value={`dept:${d.id}`}>{d.code} — {d.name}</option>
                    ))}
                  </optgroup>
                </>
              )}
            </select>
            <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
          </div>
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="h-10 px-5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </section>
  );
}
