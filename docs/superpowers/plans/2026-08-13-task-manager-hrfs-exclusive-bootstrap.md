# Task Manager Bootstrap: hrfs-Exclusive Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `hrfs` (the OSC portal's own database) the sole data source for the Task Manager roster bootstrap, removing all dependency on `ebright_hrfs`.

**Architecture:** Replace the two-tier "primary source (`ebright_hrfs`, role-keyed) + secondary source (`hrfs`, position-keyed, gap-fill only)" design with a single hrfs query that already carries everything needed. A new **role-tier dispatch** reads `hrfs.users.role_type` first (`ceo`/`superadmin`/`hod`/`department`/`branch` each get a direct, fixed mapping); everything else (`staff`, and `role_type` values with no dedicated tier) falls through to the **existing, already-hrfs-sourced** `employment.position` → `PORTAL_POSITION_MAP` logic, which is preserved almost unchanged. The idempotent upsert/diff/STALE-warning machinery in `bootstrap.ts` is untouched — only what feeds it changes.

**Tech Stack:** TypeScript, `pg` (raw SQL against `hrfs`), Prisma (Task Manager's own `ebright_yqtm` schema/client), Vitest.

---

## Why this design (recap of the investigation)

Live queries against `hrfs` this session established:

| `hrfs.users.role_type` | Count | What it actually is |
|---|---|---|
| `staff` | 515 | Regular employees — role/branch/department come from `employment.position` (existing `PORTAL_POSITION_MAP` logic covers these) |
| `branch` | 22 | **Generic per-branch site-login inboxes** (`ebright<branch>@gmail.com`) — zero have a `position` or are real people. Only 3 of the 22 exist in Task Manager today (via hand-written `EXTRA_USERS`). |
| `department` | 5 | Department site logins (`academy@`, `finance@`, `hr@`, `marketing@`, `operations@ebright.my` — wait, actual login is `operations@ebright.my`, HRFS role_type row is keyed to email `operations@ebright.my`) — `employment.department_name` already gives the real department name directly (`Academy`, `Finance`, `Human Resource`, `Marketing`, `Operation`→normalize to `Operations`) |
| `hod` | 3 | 1 real (`iqbalhakim216@gmail.com`, department already `Optimisation` in `employment`) + 2 TEST accounts with no employment record |
| `ceo` | 2 | 1 real (`kevinkhoo@ebright.my`, `employment.position = 'FT CEO'`) + 1 TEST account |
| `Branch Manager` (1, casing variant) | 1 | `test-branch-manager@ebright.my` — no employment record, stays `EXTRA_USERS`-only |

Real Branch Managers (`employment.position = 'BM'`, 20 people) are `role_type = 'staff'`, **not** `role_type = 'branch'` — the existing position-based path already handles them correctly and needs no change.

**Known, deliberate behavior changes this will cause** (flag these explicitly in review, not just accept silently):
1. **+19 new `BRANCH_SITE` accounts** will start importing (the `role_type = 'branch'` site-login inboxes not currently in `EXTRA_USERS`).
2. `kevinkhoo@ebright.my` (CEO) and the `finance@`/`marketing@`/`operations@ebright.my` (department-site) accounts become natively detected — their `OVERRIDES`/`EXTRA_USERS` entries become redundant and are removed.
3. `iqbalhakim216@gmail.com`'s department `OVERRIDES` entry is likely now redundant (hrfs already supplies `Optimisation` directly) — verified, not assumed, in Task 8.

---

## Task 1: Rewrite the pure mapper — new `HrfsUserRow` shape + role-tier dispatch (TDD)

**Files:**
- Modify: `prisma/task-manager/hrfs-map.ts`
- Test: `prisma/task-manager/hrfs-map.test.ts`

This is the core logic change. Do it test-first, in the pure file, with no DB involved.

- [ ] **Step 1: Replace the `HrfsUserRow` interface** (currently `id?`, `email`, `name`, `role`, `branchName`, `status` — the `ebright_hrfs."User"` shape) with the new `hrfs`-sourced shape:

```ts
export interface HrfsUserRow {
  /** hrfs.users.user_id — the durable cross-database link going forward
   *  (previously ebright_hrfs."User"."id"; see MappedUser.hrfsUserId). */
  userId: number;
  email: string;
  name: string | null;
  /** hrfs.role.role_type, lowercased: 'staff' | 'branch' | 'department' |
   *  'hod' | 'ceo' | 'superadmin', or an unrecognized value — NOT the same
   *  vocabulary as employment.position. Verified live 2026-08-13: 'staff'
   *  (515), 'branch' (22, all generic per-branch site logins — zero have a
   *  position), 'department' (5), 'hod' (3), 'ceo' (2), plus one stray
   *  'Branch Manager'-cased TEST row (normalize case before matching). */
  roleType: string;
  /** hrfs.users.status — 'active' expected (query already filters this,
   *  kept on the row for a defensive re-check in mapHrfsUser). */
  status: string;
  /** From the ACTIVE employment row, if any (left join — most department/
   *  branch/ceo-tier rows won't have one). */
  position: string | null;
  /** employment.department via department.department_name — real FLOW_
   *  DEPARTMENTS-shaped names already (e.g. "Finance", "Optimisation"),
   *  EXCEPT "Operation" which still needs normalizeSourceDepartment(). */
  department: string | null;
  /** employment.branch via branch.branch_name — already a real branch name
   *  in the live data (not a short code); still passed through
   *  resolveBranch() for the couple of genuine spelling aliases
   *  ("Kajang TTDI Grove", "Rimbayu"). */
  branch: string | null;
}
```

- [ ] **Step 2: Delete** the old `mapHrfsUser`, the 14-key `ROLE_MAP` (`SUPER_ADMIN`/`HOD`/`BRANCH_MANAGER`/`BM`/`"FT Coach"`/etc.), and the `departmentPolicy`/`branchPolicy` helpers that were written specifically against that `role` vocabulary. Keep `PORTAL_POSITION_MAP` (rename to `POSITION_MAP` — it's no longer "the portal's" map, it's the only one) and its own `departmentPolicy`-equivalent logic exactly as-is — this part is unchanged and well-tested.

- [ ] **Step 3: Write the new `mapHrfsUser(row: HrfsUserRow): MapResult`**, tiered:

```ts
export function mapHrfsUser(row: HrfsUserRow): MapResult {
  const email = (row.email ?? "").trim().toLowerCase();

  if (row.status !== "active") {
    return { ok: false, reason: `${email}: not active (status: ${row.status})` };
  }

  const name = row.name && row.name.trim() ? row.name.trim() : emailLocalPart(email);
  const roleType = (row.roleType ?? "").trim().toLowerCase();

  // ---- fixed tiers, driven by the portal's own login-permission role ----
  if (roleType === "ceo") {
    let user: MappedUser = {
      email, name, role: "CEO", department: null, branch: null,
      employmentType: "CEO", coachSchedule: null, hrfsUserId: row.userId,
    };
    const override = OVERRIDES[email];
    if (override) user = { ...user, ...override };
    return { ok: true, user, warnings: [] };
  }

  if (roleType === "superadmin") {
    let user: MappedUser = {
      email, name, role: "ADMIN", department: null, branch: null,
      employmentType: null, coachSchedule: null, hrfsUserId: row.userId,
    };
    const override = OVERRIDES[email];
    if (override) user = { ...user, ...override };
    return { ok: true, user, warnings: [] };
  }

  if (roleType === "branch") {
    // Verified live: every role_type='branch' row is a generic per-branch
    // site-login inbox with no employment/position — never a real person.
    const branch = resolveBranch(row.branch);
    if (!branch) {
      return { ok: false, reason: `${email}: role_type=branch but unresolved branch ${JSON.stringify(row.branch)}` };
    }
    let user: MappedUser = {
      email, name, role: "BRANCH_SITE", department: null, branch,
      employmentType: null, coachSchedule: null, hrfsUserId: row.userId,
    };
    const override = OVERRIDES[email];
    if (override) user = { ...user, ...override };
    return { ok: true, user, warnings: [] };
  }

  if (roleType === "hod" || roleType === "department") {
    const targetRole = roleType === "hod" ? "HOD" : "DEPT_SITE";
    let department = normalizeSourceDepartment(row.department);
    if (department && !(FLOW_DEPARTMENTS as readonly string[]).includes(department)) department = null;
    let user: MappedUser = {
      email, name, role: targetRole, department, branch: null,
      employmentType: targetRole === "HOD" ? "HOD" : null,
      coachSchedule: null, hrfsUserId: row.userId,
    };
    const override = OVERRIDES[email];
    if (override) user = { ...user, ...override };
    if (!user.department) {
      return { ok: false, reason: `${email}: ${targetRole} needs a department (none on the employment record, none in OVERRIDES)` };
    }
    return { ok: true, user, warnings: [] };
  }

  // ---- everything else (role_type='staff', or any unrecognized value):
  // fall through to the existing, unchanged position-based mapping ----
  return mapByPosition(row, email, name);
}

/** The body of the OLD mapPortalEmployee — unchanged logic, just renamed
 *  and taking the unified HrfsUserRow instead of PortalEmployeeRow. */
function mapByPosition(row: HrfsUserRow, email: string, name: string): MapResult {
  const positionKey = row.position ? row.position.trim().replace(/\s+/g, " ").toUpperCase() : "";
  const entry = positionKey ? POSITION_MAP[positionKey] : undefined;
  if (!entry) {
    return { ok: false, reason: `${email}: unknown or missing position: ${row.position ?? "(no active employment)"}` };
  }
  // ... branch resolution, department resolution, OVERRIDES merge, HOD
  // check, warnings — IDENTICAL body to the current mapPortalEmployee
  // (hrfs-map.ts:768-830), just add `hrfsUserId: row.userId` to the
  // returned MappedUser literal, and rename PortalEmployeeRow -> HrfsUserRow
  // in the signature.
}
```

- [ ] **Step 4: De-duplicate `EXTRA_USERS` against natively-detected rows.** In `mapAll()` (`bootstrap.ts`), the `for (const extra of EXTRA_USERS) toImport.push(extra);` line currently has no de-dup check. Once `role_type` natively detects `kevinkhoo@ebright.my` (CEO) and `test-ceo@ebright.my` (CEO), their `EXTRA_USERS` entries would otherwise double-import in the same run. Change to:

```ts
for (const extra of EXTRA_USERS) {
  const email = extra.email.trim().toLowerCase();
  if (seenEmails.has(email)) {
    warnings.push(`${email}: EXTRA_USERS entry is now redundant — already imported natively via role_type`);
    continue;
  }
  seenEmails.add(email);
  toImport.push(extra);
}
```

- [ ] **Step 5: Run the full test suite for this file** (still failing — tests not updated yet, that's Task 7): `npx vitest run prisma/task-manager/hrfs-map.test.ts`. Expected: compile errors / failures until Task 7. This step is just to confirm Step 1-4 compiles in isolation before moving to Task 7's full test rewrite.

- [ ] **Step 6: Commit.**

```bash
git add prisma/task-manager/hrfs-map.ts
git commit -m "refactor(task-manager): rewrite mapHrfsUser around hrfs.users.role_type tiers"
```

---

## Task 2: Trim `SHORT_CODE_BRANCH_MAP` (low-risk cleanup, verify first)

**Files:**
- Modify: `prisma/task-manager/hrfs-map.ts`

- [ ] **Step 1: Verify live**, before deleting anything — run a read-only query against `hrfs`'s `branch` table (`select distinct branch_name from branch`) and confirm none of the ~20 short codes (`AMP`, `BBB`, `BSP`, etc.) appear as real `hrfs` branch names. (Already confirmed informally this session: `hrfs.employment` → `branch.branch_name` returns full names like "Danau Kota", "Bandar Tun Hussein Onn" — not codes — but re-verify against the full table, not just the sample seen so far.)
- [ ] **Step 2:** If confirmed, delete `SHORT_CODE_BRANCH_MAP`'s ~20 code-only entries, keeping only the two genuine spelling aliases already present (`"Kajang TTDI Grove"` → `"Kajang TTDI Groove"`, `"Rimbayu"` → `"Bandar Rimbayu"`) plus `IDENTITY_BRANCH_MAP`. Update `UNRESOLVED_BRANCH_CODES` similarly (most of its entries — `ACD`, `DPU`, `FNC`, `HQ`, `HR`, `IOP`, `MKT`, `OD`, `OPT`, `RM` — were `ebright_hrfs`-specific org markers; re-verify against live `hrfs` branch values instead of assuming they still apply).
- [ ] **Step 3: Commit.** This task is independent and can be skipped/deferred without affecting correctness — the extra entries are simply dead code once `ebright_hrfs` is gone, not broken code.

---

## Task 3: Rewrite the I/O layer in `bootstrap.ts` — single query, renamed functions

**Files:**
- Modify: `prisma/task-manager/bootstrap.ts`

- [ ] **Step 1: Delete** `resolveHrfsUrl()` (old, pointed at `ebright_hrfs`), `fetchHrfsRows()` (old, queried `ebright_hrfs."User"`), `resolvePortalUrl()`, `fetchPortalEmployees()`, `fetchPortalDepartments()`, `enrichDepartments()` — all superseded by one function.

- [ ] **Step 2: Add the new, single source function:**

```ts
/** HRFS_DATABASE_URL wins if set; otherwise TASK_MANAGER_DATABASE_URL with
 *  the db name swapped to "hrfs" — same Postgres server, same credentials
 *  (verified). This is now the ONLY external data source this script reads. */
function resolveHrfsUrl(): string {
  if (process.env.HRFS_DATABASE_URL) return process.env.HRFS_DATABASE_URL;
  const base = process.env.TASK_MANAGER_DATABASE_URL;
  if (!base) {
    throw new Error("bootstrap: neither HRFS_DATABASE_URL nor TASK_MANAGER_DATABASE_URL is set — cannot locate hrfs.");
  }
  const url = new URL(base);
  url.pathname = "/hrfs";
  return url.toString();
}

/** Read-only: every ACTIVE, non-deleted hrfs.users row, joined to its
 *  active employment (if any) for position/department/branch. Replaces the
 *  old ebright_hrfs primary fetch + the portal secondary fetch + the
 *  portal department-enrichment fetch — hrfs already carries everything. */
async function fetchHrfsRows(): Promise<HrfsUserRow[]> {
  const pool = new Pool({ connectionString: resolveHrfsUrl(), max: 3, connectionTimeoutMillis: 10_000 });
  try {
    const result = await pool.query<HrfsUserRow>(`
      select
        u.user_id as "userId", lower(u.email) as email, up.full_name as name,
        r.role_type as "roleType", u.status, e.position,
        d.department_name as department, b.branch_name as branch
      from users u
      join role r on r.role_id = u.role_id
      left join user_profile up on up.user_id = u.user_id
      left join employment e on e.user_id = u.user_id and e.status = 'active'
      left join department d on d.department_id = e.department_id
      left join branch b on b.branch_id = e.branch_id
      where u.status = 'active' and u.deleted_at is null
      order by u.user_id
    `);
    return result.rows;
  } finally {
    await pool.end();
  }
}
```

- [ ] **Step 3: Simplify `main()`** — replace the fetch → mapAll → try/catch portal-second-source block → try/catch department-enrichment block sequence with:

```ts
async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.env.BOOTSTRAP_DRY_RUN === "1";

  const rows = await fetchHrfsRows();
  const result = mapAll(rows);

  printSummary(result, { dryRun });

  if (dryRun) {
    await printDryRunDiff(result.toImport); // Task 6
    return;
  }

  await printStaleSkipWarnings(result.skipped);
  const { created, updated } = await upsertUsers(result.toImport);
  await provisionUtilityFlows();

  console.log(`\n[bootstrap] users: ${created} created, ${updated} updated; utility flows: ${UTILITY_FLOWS.length} ensured`);
}
```

- [ ] **Step 4: Update `printSummary()`'s labels** (`"HRFS ACTIVE rows fetched"` etc. — still accurate, just double-check no remaining "portal second source" wording that no longer makes sense once there's only one source).

- [ ] **Step 5: Commit.**

```bash
git add prisma/task-manager/bootstrap.ts
git commit -m "refactor(task-manager): bootstrap sources exclusively from hrfs, drop ebright_hrfs"
```

---

## Task 4: `hrfsUserId` — reset stale cross-database values

**Files:**
- Create: `prisma/task-manager/migrations/20260813000000_reset_hrfs_user_link/migration.sql`
- Modify: `prisma/task-manager/schema.prisma` (doc comment only, lines 41-46)

Existing `User.hrfsUserId` values reference `ebright_hrfs."User"."id"`. Going forward the same column stores `hrfs.users.user_id` instead — same `Int?` type, no structural migration needed, but the **existing values are now wrong** (they'd silently point at the wrong database's ids if left in place, since there's no foreign key to catch it).

- [ ] **Step 1: Create the data-only migration:**

```sql
-- hrfsUserId previously stored ebright_hrfs."User"."id"; the bootstrap
-- source switched to hrfs.users.user_id exclusively (2026-08-13 — see
-- prisma/task-manager/hrfs-map.ts's HrfsUserRow doc comment). Existing
-- values reference the now-unused database's ids and would be silently
-- wrong if left in place. The next bootstrap run repopulates every matched
-- user from the new source (upsertUsers writes hrfsUserId whenever the
-- source row supplies one — see bootstrap.ts).
UPDATE "User" SET "hrfsUserId" = NULL;
```

- [ ] **Step 2: Update `schema.prisma`'s doc comment** (currently: `"Direct link to ebright_hrfs."User"."id" (integer, 2026-07-31)..."`) to describe `hrfs.users.user_id` instead, and note the 2026-08-13 source switch + reset.

- [ ] **Step 3: Run the migration** against the Task Manager database (`npx prisma migrate deploy --config prisma.task-manager.config.ts`, or the project's usual migration command) — **only after the code changes are reviewed and ready**, since a real bootstrap run should follow shortly after to repopulate the field. Coordinate timing with Task 9's dry-run review, not before.

- [ ] **Step 4: Commit** (migration file + schema comment together; do not run the migration in this commit's scope — that's a deploy-time action, covered in the rollout section below).

---

## Task 5: Preserving existing users — no new mechanism needed, verify the existing one still applies

**Files:** none (verification-only task)

- [ ] Confirm `upsertUsers()` (`bootstrap.ts:293-326`) is unchanged: still keyed by `email`, still `findUnique` → `update` (existing) or `create` (new), still never deletes. Confirm `diffUserFields()` (`hrfs-map.ts`) still prints a loud `CHANGED` line per field that differs, unchanged. Confirm `printStaleSkipWarnings()` still runs on skipped emails, unchanged. **None of these three functions need to change** — the whole point of this migration is that they're agnostic to where `toImport` came from. This task is just confirming that invariant holds after Tasks 1-4 (re-read the three functions post-refactor, check no accidental coupling to the old `ebright_hrfs`-shaped types crept in).

---

## Task 6: Dry-run diff preview (verification tool — this is what ask #6 needs)

**Files:**
- Modify: `prisma/task-manager/bootstrap.ts`

Today, `--dry-run` never connects to the Task Manager database at all (`printSummary` prints this guarantee explicitly). This task adds a **read-only** preview of what a real run would change, without weakening that guarantee's spirit (still zero writes) — it's an intentional, small scope increase (a `findUnique` read per user) that needs to be called out, not slipped in silently.

- [ ] **Step 1: Add `printDryRunDiff`:**

```ts
/** Dry-run only: read-only preview of what a real run would do, using the
 *  SAME diffUserFields() logic upsertUsers() uses for its CHANGED lines —
 *  so the preview and the real run can never drift apart. Never calls
 *  .create()/.update(); only .findUnique(). */
async function printDryRunDiff(toImport: MappedUser[]): Promise<void> {
  let wouldCreate = 0, wouldChange = 0, unchanged = 0;
  for (const user of toImport) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (!existing) {
      wouldCreate++;
      console.log(`[bootstrap] DRY-RUN WOULD CREATE ${user.email}: role=${user.role} dept=${user.department ?? "—"} branch=${user.branch ?? "—"}`);
      continue;
    }
    const changes = diffUserFields(existing, user);
    if (changes.length > 0) {
      wouldChange++;
      console.log(`[bootstrap] DRY-RUN WOULD CHANGE ${user.email}: ${changes.join(", ")}`);
    } else {
      unchanged++;
    }
  }
  console.log(`\n[bootstrap] DRY-RUN diff: ${wouldCreate} would be created, ${wouldChange} would change, ${unchanged} unchanged`);
}
```

- [ ] **Step 2:** Wire it into `main()`'s `if (dryRun)` branch (already shown in Task 3, Step 3).
- [ ] **Step 3:** Update the message in `printSummary()` that currently says *"DRY RUN — no connection to the Task Manager database was made; nothing was written"* to instead say *"DRY RUN — the Task Manager database was read (to preview changes) but never written to."* — accurate, not overstated.
- [ ] **Step 4: Commit.**

```bash
git add prisma/task-manager/bootstrap.ts
git commit -m "feat(task-manager): read-only dry-run diff preview against the live roster"
```

---

## Task 7: Rewrite `hrfs-map.test.ts`

**Files:**
- Modify: `prisma/task-manager/hrfs-map.test.ts`

- [ ] **Step 1:** Replace the `row()` fixture helper (old `ebright_hrfs`-shaped: `id`, `email`, `name`, `role`, `branchName`, `status`) with an `hrfs`-shaped one matching the new `HrfsUserRow`:

```ts
function row(overrides: Partial<HrfsUserRow> = {}): HrfsUserRow {
  return {
    userId: 1,
    email: "person@example.invalid",
    name: "Test Person",
    roleType: "staff",
    status: "active",
    position: null,
    department: null,
    branch: null,
    ...overrides,
  };
}
```

- [ ] **Step 2:** Delete the `ROLE_MAP families` describe block (tests `SUPER_ADMIN`, `HOD`/branch-manager/`BM`/`FT Coach`/`PT Coach`/`FT EXEC`/`REGIONAL_MANAGER`/`Full_Time`/`Part_Time`/`INTERN`/`ACADEMY`/`HR` against the old `role` field) — all superseded.

- [ ] **Step 3:** Add a new `role-tier dispatch` describe block:

```ts
describe("mapHrfsUser — role_type tier dispatch", () => {
  it("roleType='ceo' -> CEO, fixed fields, no position needed", () => {
    const result = mapHrfsUser(row({ roleType: "ceo", email: "ceo@ebright.my", name: "Kevin" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("CEO");
      expect(result.user.employmentType).toBe("CEO");
      expect(result.user.department).toBeNull();
      expect(result.user.branch).toBeNull();
    }
  });

  it("roleType='superadmin' -> ADMIN, fixed fields", () => {
    const result = mapHrfsUser(row({ roleType: "superadmin", email: "admin@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.role).toBe("ADMIN");
  });

  it("roleType='branch' -> BRANCH_SITE with the resolved branch, no position needed", () => {
    const result = mapHrfsUser(row({ roleType: "branch", branch: "Ampang", email: "ebrightampang@gmail.com" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("BRANCH_SITE");
      expect(result.user.branch).toBe("Ampang");
    }
  });

  it("roleType='branch' with an unresolvable branch is skipped", () => {
    const result = mapHrfsUser(row({ roleType: "branch", branch: null, email: "no-branch@example.invalid" }));
    expect(result.ok).toBe(false);
  });

  it("roleType='hod' -> HOD, department from the employment record", () => {
    const result = mapHrfsUser(row({ roleType: "hod", department: "Optimisation", email: "hod@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("HOD");
      expect(result.user.department).toBe("Optimisation");
    }
  });

  it("roleType='hod' with no department (and no OVERRIDES entry) is skipped", () => {
    const result = mapHrfsUser(row({ roleType: "hod", department: null, email: "no-dept-hod@example.invalid" }));
    expect(result.ok).toBe(false);
  });

  it("roleType='department' -> DEPT_SITE, department from the employment record, 'Operation' normalized", () => {
    const result = mapHrfsUser(row({ roleType: "department", department: "Operation", email: "operations@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("DEPT_SITE");
      expect(result.user.department).toBe("Operations");
    }
  });

  it("roleType='staff' falls through to position-based mapping (existing behavior, unchanged)", () => {
    const result = mapHrfsUser(row({ roleType: "staff", position: "PT COACH", branch: "Putrajaya", email: "coach@ebright.my" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("MEMBER");
      expect(result.user.employmentType).toBe("Coach");
      expect(result.user.coachSchedule).toBe("Part Time");
    }
  });

  it("an unrecognized roleType also falls through to position-based mapping", () => {
    const result = mapHrfsUser(row({ roleType: "Branch Manager", position: null, email: "test-bm@example.invalid" }));
    expect(result.ok).toBe(false); // no position -> unknown/missing position, same as today
  });
});
```

- [ ] **Step 4:** Port the existing `mapPortalEmployee` describe block (`hrfs-map.test.ts:525-606`) forward almost verbatim — same test bodies, calling `mapHrfsUser(row({ roleType: "staff", ...overrides }))` instead of `mapPortalEmployee(emp(overrides))`. This is the block that already covers `INTERN`/`PT COACH`/`BM`/`FT HOD`/unknown-position/`EXECUTIVE`+`FT EXEC`/`OVERRIDES` precedence — all still valid, unchanged logic.

- [ ] **Step 5:** Update the `ROLE_MAP completeness` describe block — it currently asserts `ROLE_MAP` has an entry for every `ebright_hrfs.role` value observed live on 2026-07-24. Replace with a `POSITION_MAP completeness` test asserting coverage of every live `employment.position` value observed 2026-08-13 (`PT COACH`(103), `INTERN`(37), `BM`(20), `FT COACH`(10), `FT EXEC`(10), `FT HOD`(6), `"FT Coach"`(3), `ADMIN`(2, department-tier — not position-mapped, expected), `"FT Executive"`(1, needs an alias added to `POSITION_MAP` pointing at the same entry as `"FT EXEC"`), `FT CEO`(1, ceo-tier — not position-mapped, expected)) — add the `"FT Executive"` alias to `POSITION_MAP` as part of this step (the one real gap found live).

- [ ] **Step 6: Run the full suite**: `npx vitest run prisma/task-manager/hrfs-map.test.ts` — must be green before continuing.

- [ ] **Step 7: Commit.**

```bash
git add prisma/task-manager/hrfs-map.test.ts
git commit -m "test(task-manager): rewrite hrfs-map tests for role_type-tier dispatch"
```

---

## Task 8: Trim `OVERRIDES`/`EXTRA_USERS` for entries now redundant

**Files:**
- Modify: `prisma/task-manager/hrfs-map.ts`

Verify each of these against the new dry-run output (Task 9) **before** deleting — don't delete blind:

- [ ] `OVERRIDES["finance@ebright.my"]`, `["marketing@ebright.my"]`, `["operation@ebright.my"]` (the `SUPER_ADMIN`-demotion overrides) — likely fully redundant: `role_type='department'` now natively produces `DEPT_SITE` with the correct department (`Finance`, `Marketing`, `Operations`) directly from `employment.department_name`. **Note the email:** the override key is `"operation@ebright.my"` (no s) but the live `role_type='department'` row is `operations@ebright.my` (with s, matching the `EXTRA_USERS` entry below) — these may be two different login rows; check both exist and resolve which is the real one before deleting either.
- [ ] `OVERRIDES["od@ebright.my"]` — sets `department: "Optimisation"` for display purposes only (od@ is `ADMIN`, no authorization effect). Since `role_type='superadmin'` tier doesn't read `employment.department` at all, this override is **still needed** — keep it.
- [ ] `OVERRIDES["iqbalhakim216@gmail.com"]` — verified live: `employment.department_name` is already `"Optimisation"` for this HOD. Redundant; safe to delete (no-op either way, but cleaner without it).
- [ ] `OVERRIDES["maizatulmaisarahmior@gmail.com"]`, `["ngyingchenn@gmail.com"]` (FT EXEC department markers) — these people are `role_type='staff'`, still flow through position-based mapping unchanged; **keep** — not affected by this migration.
- [ ] `EXTRA_USERS` entry for `kevinkhoo@ebright.my` — delete; natively detected via `role_type='ceo'` with correct `position='FT CEO'`.
- [ ] `EXTRA_USERS` entries for `operations@ebright.my`, `academy@ebright.my`, `hr@ebright.my` — verify live: all three are `role_type='department'` with a real `employment.department_name` (`Operation`→`Operations`, `Academy`, `Human Resource`) — likely all three now redundant; delete after confirming the dry-run shows them as natively-detected with matching values (not silently different).
- [ ] `EXTRA_USERS` entries for `ebrightbandarbarubangi@gmail.com`, `ebrightbandarrimbayu@gmail.com`, `ebrightonline@gmail.com` (`BRANCH_SITE`) — verify live: all `role_type='branch'` with a resolvable branch — likely redundant; delete after confirming dry-run match. **Deleting these does NOT remove the accounts** — they'll still import, just natively instead of via the hand-written list; the other 19 `role_type='branch'` accounts (not currently in `EXTRA_USERS` at all) start importing for the first time regardless of this cleanup.
- [ ] `EXTRA_USERS` TEST-* entries (`test-ceo@`, `test-hod-optimisation@`, `test-hod-finance@`, `test-hq-fulltime@`, `test-branch-manager@`, `test-branch-exec@`, `test-coach@`) — **keep all of these.** `test-ceo@` will now log a "redundant" warning (Task 1 Step 4) but its native detection produces identical values, so leaving the `EXTRA_USERS` entry is harmless and the warning is informational only; the other 6 have no employment record and are NOT natively detected, so they still need `EXTRA_USERS`.

---

## Task 9: Live verification — dry-run comparison against the current roster

**Files:** none (this is a review/execution task, not a code task)

This is how ask #5 and #6 actually get answered with evidence, not assertion.

- [ ] **Step 1:** On `main` (before any of these changes), confirm the CURRENT bootstrap dry-run is clean/expected: `npm run tm:bootstrap -- --dry-run` — this is just a sanity baseline, no diff tool exists yet on this branch.
- [ ] **Step 2:** On the new branch, after Tasks 1-7 are merged locally (not yet run for real), run: `npm run tm:bootstrap -- --dry-run` — this now produces the full `DRY-RUN WOULD CREATE` / `DRY-RUN WOULD CHANGE` report from Task 6, read-only against the live `ebright_yqtm` database.
- [ ] **Step 3: Review the report in these specific buckets, not just the totals:**
  - **WOULD CREATE, `role=BRANCH_SITE`** — expect ~19 new rows (the previously-uncovered branch site logins). Confirm the branch names look right; confirm none of these 19 collide with an existing different-role account under the same email.
  - **WOULD CHANGE, department-tier accounts** (`finance@`, `marketing@`, `operations@`, `academy@`, `hr@ebright.my`) — expect either "no change" (if `OVERRIDES`/`EXTRA_USERS` already had it right) or a department-name correction; should NOT show a `role` change (they should already be `DEPT_SITE`).
  - **WOULD CHANGE, `kevinkhoo@ebright.my`** — expect "no change" (native detection should reproduce the exact `EXTRA_USERS` values it's replacing).
  - **WOULD CHANGE, `iqbalhakim216@gmail.com`** — expect "no change" (native `department=Optimisation` should match the override it's replacing).
  - **Any `role` change on an account NOT in the buckets above** — this would be unexpected; investigate individually before proceeding. The tiered dispatch should only change role for people whose `role_type` is `ceo`/`superadmin`/`hod`/`department`/`branch` — everyone else's role is computed by the same unchanged position-mapping logic as before, so an unexpected role change elsewhere signals a bug in the tier dispatch, not a real data correction.
  - **Cross-reference against this session's earlier roster comparison** — the 39 branch-enrichment-gap accounts, 35 name-placeholder accounts, and the 1 stale-active account (`didisabarini@gmail.com`) identified earlier should now mostly show up as **WOULD CHANGE** entries that fix those exact problems (real name instead of email-placeholder, a resolved branch instead of null). If they *don't* appear as fixes, that's worth understanding before proceeding — it would mean the new source doesn't actually resolve what it was expected to.
- [ ] **Step 4:** Only after the dry-run report has been read and each bucket above makes sense, proceed to the actual migration + real run (outside the scope of "plan," this is deploy-day activity — run `Task 4`'s migration, then `npm run tm:bootstrap` for real, then spot-check a handful of accounts in the Task Manager UI directly).

---

## Task 10: Final review

- [ ] Re-read `bootstrap.ts` and `hrfs-map.ts` top-to-bottom — confirm no remaining reference to `ebright_hrfs`, `PortalEmployeeRow`, `mapPortalEmployee`, `resolvePortalUrl`, `fetchPortalEmployees`, `fetchPortalDepartments`, `enrichDepartments`, or the old `ROLE_MAP` (grep for `ebright_hrfs` across `prisma/task-manager/` — should return zero functional hits, only historical comments if any are deliberately kept for context).
- [ ] Confirm `hrfs-map.test.ts` is fully green.
- [ ] Confirm `npx tsc --noEmit` is clean (same two permanently-pre-existing unrelated errors are fine: `src/app/api/branch/dashboard/route.ts`, `src/app/components/ClickUpPieChart.tsx` — nothing new).
- [ ] Use `superpowers:finishing-a-development-branch` once Task 9's dry-run review is satisfactory and the user is ready to actually run the migration.

---

## Spec coverage check (self-review against your 6 asks)

1. **Exact files changed** — `prisma/task-manager/bootstrap.ts`, `prisma/task-manager/hrfs-map.ts`, `prisma/task-manager/hrfs-map.test.ts`, `prisma/task-manager/schema.prisma` (comment only), one new migration file. ✓
2. **`role_type` + `employment.position` role determination** — Task 1's tiered dispatch: `role_type` picks the tier (ceo/superadmin/hod/department/branch = fixed mapping; staff/unrecognized = fall through), `position` only matters for the fall-through tier via the existing `POSITION_MAP`. ✓
3. **Existing `hrfsUserId` handling** — Task 4: repurposed to `hrfs.users.user_id`, one-time reset migration, no schema/type change. ✓
4. **Preserving existing users** — Task 5: confirms the existing email-keyed upsert/diff/STALE machinery needs no changes and still governs this. ✓
5. **Verifying correct users/branches/departments/roles** — Task 7 (unit tests per tier) + Task 9 (live dry-run review against real data, bucketed). ✓
6. **Dry-run comparison mechanism** — Task 6 (`printDryRunDiff`, reuses `diffUserFields` so preview and real run can't drift apart) + Task 9 (how to actually run and read it). ✓
