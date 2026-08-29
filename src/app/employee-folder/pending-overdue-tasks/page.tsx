import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { resolveTaskOverviewAccess } from "@/lib/pendingOverdueTasksAccess";
import { listEmployeeOverviewRows, listPendingOverdueTaskDetails, listBranches, listDepartments } from "@/lib/employeeQueries";
import PendingOverdueTasksView from "./PendingOverdueTasksView";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ branch?: string; department?: string; role?: string; staff?: string }>;
}

export default async function PendingOverdueTasksPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  // Access is resolved from the session server-side, never trusted from the
  // client — CEO/Finance/HR/Superadmin get { kind: "full" }, HOD gets their
  // own department, a real BM (or the generic shared branch login) gets
  // their own branch, and every plain "staff" account (or anything else not
  // named in the spec) gets denied outright, redirected away exactly like
  // every other role-gated whole-page route in this app (see
  // attendance/leave/approvals/page.tsx's own redirect("/home") precedent).
  const access = await resolveTaskOverviewAccess(session.user.email);
  if (access.kind === "denied") redirect("/home");

  const { branch, department, role, staff } = await searchParams;
  // Guarded on `staff` itself being non-empty BEFORE splitting (2026-08-27,
  // see conversation — bug fix) — "".split(",") returns [""], one empty
  // string, not an empty array, and Number("") is 0, not NaN, so an absent
  // `staff` param used to produce selectedStaffIds = [0] instead of [],
  // which then filtered every row out (no real user_id is ever 0) on every
  // default page load, for every role, not just Finance. `n > 0` (not just
  // Number.isFinite) is a second, independent hardening — this makes the
  // fix self-correcting even for a browser tab whose URL already has a
  // literal "?staff=0" baked in from before this fix existed (the picker's
  // own onApply could have written that out the moment it was opened and
  // closed even once, back when selectedStaffIds was silently [0] on every
  // load) — a hard refresh/re-navigation clears that stale query param
  // automatically, but this guard means an old bookmark or a tab that never
  // reloads the JS bundle can't reproduce the bug via a stale URL either.
  const selectedStaffIds = staff
    ? staff
        .split(",")
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];
  // Month/Year is deliberately NOT a server round-trip or URL param — same
  // convention as the existing per-employee Task tab (TaskPanel in
  // EmployeeRecordPanels.tsx): the full open-task list is fetched once
  // below (never re-fetched on month/year change) and PendingOverdueTasksView
  // filters/re-counts it client-side, with its own default-to-current-month
  // lazy useState initializer mirroring that same component exactly. Only
  // Branch/Department/Role narrow the server-side employee query itself
  // (they change WHICH employees' tasks get fetched at all), so only those
  // three are real query params.

  // Active employees only — Pre-stage candidates and Exit-stage departing
  // employees don't have ongoing work to track here (a Pre candidate has no
  // real Task Manager account at all yet; an Exit employee's own tasks are
  // in the process of being wound down, not a meaningful "outstanding work"
  // signal). Scoped by skipScopeFilter:true + this page's OWN access
  // resolution instead of the generic per-session Employee Overview scope,
  // since that scope's own "staff" bucket would incorrectly restrict a real
  // BM employee to themselves only (see pendingOverdueTasksAccess.ts).
  const allRows = (await listEmployeeOverviewRows({ skipScopeFilter: true })).filter((r) => r.stage === "active");

  // Department/branch scoping enforced here regardless of what the request
  // sends — HOD/BM never even get sent branch/department query params by
  // the UI (see PendingOverdueTasksView), but this filters on the server's
  // own resolved access either way, not on anything client-supplied.
  let scopedRows = allRows;
  if (access.kind === "department") {
    scopedRows = scopedRows.filter((r) => r.departmentCode === access.departmentCode);
  } else if (access.kind === "branch") {
    scopedRows = scopedRows.filter((r) => r.branchCode === access.branchCode);
  }

  // Staff filter's own search pool (2026-08-27, see conversation) — the
  // SAME scope-limited set the main table starts from, captured BEFORE the
  // Branch/Department/Role query filters below narrow it further. The Staff
  // picker searches this full-scope pool independently of whatever the
  // other three filters currently show (picking a person doesn't require
  // first narrowing Branch/Department/Role to find them). Enforcement of
  // "no way to search outside the viewer's scope" happens right here,
  // structurally: a department-/branch-scoped HOD/BM's browser is never
  // sent any row outside their own scope in the first place — there is no
  // client-side search or query that could surface a name that was never
  // part of this payload, regardless of what the client-side picker code
  // does with it.
  const staffPoolRows = scopedRows;

  // Branch/Department filter options — from the FULL scoped-by-role set
  // (before the branch/department filter itself is applied), so choosing a
  // Department doesn't shrink the Branch dropdown's own option list. Only
  // ever meaningful for "full" access (HOD/BM are already narrowed to one
  // branch/department and never render these filters at all), but computed
  // unconditionally here since it's cheap and keeps this logic in one place.
  const branchOptions =
    access.kind === "full" ? Array.from(new Set(scopedRows.map((r) => r.branchCode).filter((c): c is string => Boolean(c)))) : [];
  const departmentOptions =
    access.kind === "full"
      ? Array.from(new Set(scopedRows.map((r) => r.departmentCode).filter((c): c is string => Boolean(c))))
      : [];
  const [allBranches, allDepartments] = access.kind === "full" ? await Promise.all([listBranches(), listDepartments()]) : [[], []];
  const branchNameByCode = new Map(allBranches.map((b) => [b.code, b.name]));
  const departmentNameByCode = new Map(allDepartments.map((d) => [d.code, d.name]));

  // Server-enforced branch/department filter — only ever honored when the
  // viewer's own access is "full" (CEO/Finance/HR/Superadmin); a
  // department-/branch-scoped HOD/BM sending these params (e.g. a
  // hand-crafted URL) has no effect, since scopedRows is already narrowed
  // to their own department/branch above and these filters can only ever
  // narrow further, never widen.
  if (access.kind === "full") {
    if (branch) scopedRows = scopedRows.filter((r) => r.branchCode === branch);
    if (department) scopedRows = scopedRows.filter((r) => r.departmentCode === department);
  }

  // Role (position/job-title) filter options — real distinct positions
  // within the viewer's own scope (department/branch/full), not a
  // hardcoded list (the two existing hardcoded lists elsewhere in this app,
  // POSITION_OPTIONS and EmployeeRecordsTable's own ROLE_OPTIONS, disagree
  // with each other and with real data — see conversation). Computed from
  // scopedRows BEFORE the role filter itself, so the dropdown always shows
  // every real choice regardless of which one is currently selected.
  const roleOptions = Array.from(new Set(scopedRows.map((r) => r.position).filter((p): p is string => Boolean(p)))).sort((a, b) =>
    a.localeCompare(b),
  );
  if (role) scopedRows = scopedRows.filter((r) => r.position === role);

  // Staff filter — ANDed with Branch/Department/Role like any other filter
  // on this page (2026-08-27, see conversation: picking specific people
  // narrows the table on top of whatever else is selected, not instead of
  // it). Selecting multiple people is an OR within this one filter (show
  // any of the ticked people), consistent with a typical multi-select.
  if (selectedStaffIds.length > 0) {
    const idSet = new Set(selectedStaffIds);
    scopedRows = scopedRows.filter((r) => idSet.has(r.id));
  }

  const taskDetails = await listPendingOverdueTaskDetails(scopedRows.map((r) => r.id));

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <PendingOverdueTasksView
        rows={scopedRows.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          position: r.position,
          branchCode: r.branchCode,
          branchName: r.branchName,
          departmentCode: r.departmentCode,
          departmentName: r.departmentName,
          tasks: taskDetails[r.id] ?? { pending: [], overdue: [] },
        }))}
        canFilterLocation={access.kind === "full"}
        branchOptions={branchOptions
          .map((code) => ({ code, name: branchNameByCode.get(code) ?? code }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        departmentOptions={departmentOptions
          .map((code) => ({ code, name: departmentNameByCode.get(code) ?? code }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        roleOptions={roleOptions}
        selectedBranch={branch ?? ""}
        selectedDepartment={department ?? ""}
        selectedRole={role ?? ""}
        staffPool={staffPoolRows.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          position: r.position,
          branchCode: r.branchCode,
          branchName: r.branchName,
          departmentCode: r.departmentCode,
          departmentName: r.departmentName,
        }))}
        selectedStaffIds={selectedStaffIds}
      />
    </AppShell>
  );
}
