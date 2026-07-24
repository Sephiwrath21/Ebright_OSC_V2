# Task Manager Native Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace OSC's ClickUp-API-backed "ClickUp Tasks" feature with the Ebright Flow Task Manager, merged natively into this repo (UI + engine + analytics + own Prisma schema against a separate `ebright_task_manager` database on the shared Postgres server).

**Architecture:** Flow's self-contained UI package (`D:\ebright-flow\src\osc`) ports verbatim to `src/task-manager/ui`; its HTTP bridge (`/api/internal/*` + `flow-client.ts` + shared secret) is replaced by an in-process data layer (`src/task-manager/data/*`) exposing the exact same function signatures, so the page wiring from Flow's `osc-demo` pages ports nearly unchanged with `await auth()` supplying the acting email. A second Prisma 7 client (custom output, `@prisma/adapter-pg`, own config file) serves the Task Manager schema. Redis-dependent reminder scheduling degrades to a logged no-op when `REDIS_URL` is unset.

**Tech Stack:** Next.js 16.2.4 (Turbopack, Promise params), React 19, Tailwind v4 CSS-first, Prisma 7 + adapter-pg (dual clients), next-auth v5 (`auth()`), zod, @dnd-kit, vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-task-manager-native-merge-design.md`

**Source repo:** `D:\ebright-flow` (read-only source of truth for ported code — never modify it).

**Branch:** all work happens on `task-manager-migration` (already created).

---

## Conventions used by every task

**The import-rewrite map.** Every file copied from `D:\ebright-flow` must have its import specifiers rewritten per this table (including dynamic `import("...")` strings and `vi.mock("...")` specifiers in tests — grep for ALL of them):

| Old specifier (in Flow) | New specifier (in OSC) |
|---|---|
| `@prisma/client` | `@/generated/task-manager-client` |
| `@/lib/prisma` or `../../src/lib/prisma` | `@/task-manager/prisma` (or relative `../prisma` from `engine/`) |
| `@/lib/api-server` or `../../src/lib/api-server` | `@/task-manager/lib/api-server` (or `../lib/api-server`) |
| `@/lib/users` or `../../src/lib/users` | `@/task-manager/lib/users` (or `../lib/users`) |
| `@/lib/types` or `../../src/lib/types` | `@/task-manager/lib/types` (or `../lib/types`) |
| `@/lib/item-schemas` or `../../src/lib/item-schemas` | `@/task-manager/lib/item-schemas` (or `../lib/item-schemas`) |
| `@/lib/queues` or `../../src/lib/queues` | `@/task-manager/lib/queues` (or `../lib/queues`) |
| `@/lib/email` or `../../src/lib/email` | `@/task-manager/lib/email` (or `../lib/email`) |
| `@server/engine/<x>` | `@/task-manager/engine/<x>` |
| `../analytics/_lib` (from `api/internal/`) | `./analytics/_lib` or `../analytics/_lib` per new location |
| `../email/templates` (from `server/engine/`) | `../email/templates` (unchanged — same relative layout) |

Prefer the relative form when the importing file lives inside `src/task-manager/` (matches the folder's self-contained style); the `@/task-manager/...` alias form is equally correct.

**Copying files on Windows (Git Bash):** use `cp` with forward slashes, e.g. `cp /d/ebright-flow/src/lib/users.ts src/task-manager/lib/users.ts`. All commands below are Git Bash (the Bash tool), run from the repo root `d:\Ebright\Ebright_OSC_V2`.

**Typecheck gate:** `next.config.ts` sets `ignoreBuildErrors: true`, so `npm run build` does NOT prove type-safety, and the repo may have pre-existing `tsc` errors. Task 1 records a baseline. Every later task's typecheck step means: run `npx tsc --noEmit 2>&1 | grep "src/task-manager\|src/app/task-manager\|prisma/task-manager\|src/generated"` and require ZERO hits (no new errors in our files). Pre-existing errors elsewhere are not yours to fix.

**Tests:** `npm test` = `vitest run`, config includes `src/**/*.test.ts` (node environment, `@` → `./src`). Ported test files land under `src/` so they're picked up automatically. Ported pure-logic tests must pass without Postgres or Redis (they're designed that way — `processReminder` dynamically imports impure modules precisely so importing the file in vitest is side-effect-free).

**Commits:** commit after every task with the message given in its final step. Trailer on every commit:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## File structure (end state)

```
prisma.task-manager.config.ts            # Prisma CLI config for the second schema
prisma/task-manager/
  schema.prisma                          # Flow schema, Prisma-7-ized (custom output, no url)
  migrations/**                          # Flow's 18 migrations + migration_lock.toml, verbatim
  seed.ts                                # Flow's demo seed, imports rewired (dev-only, wipes DB)
  bootstrap.ts                           # NEW: idempotent prod provisioning (flows + roster users)
  roster-parse.ts                        # NEW: pure CSV row parser/validator (unit-tested)
  roster-parse.test.ts                   # NEW: its tests
  roster.csv                             # NEW: staff roster template (filled by ops before cutover)
src/generated/task-manager-client/       # generated, gitignored
src/task-manager/
  prisma.ts                              # NEW: adapter-pg singleton on TASK_MANAGER_DATABASE_URL
  lib/
    api-server.ts                        # ApiHttpError only (trimmed port)
    types.ts, item-schemas.ts, users.ts, email.ts, redis.ts   # ports
    queues.ts                            # port + REDIS_URL no-op guard
  email/templates.ts (+ .test.ts)        # port
  engine/run.ts, snapshot.ts, conditions.ts, reminders.ts (+ 4 test files)  # ports
  analytics/_lib.ts, _payloads.ts (+ _lib.test.ts)            # ports
  manpower-helpers.ts (+ .test.ts)       # port of api/internal/_manpower.ts
  data/core.ts                           # NEW: FlowBridgeError/NoAccountError/native()/requireUserByEmail
  data/queries.ts                        # NEW: overview / detail / staff / department-detail
  data/ceo.ts                            # NEW: CEO dashboard config get/save
  data/tasks.ts                          # NEW: assign / complete / skip / reopen
  data/manpower.ts                       # NEW: 9 manpower-schedule functions
  data/kanban.ts                         # NEW: 9 HOD-kanban functions
  data.ts                                # NEW: barrel re-exporting the data modules
  ui/                                    # port of D:\ebright-flow\src\osc (minus flow-client.ts)
    task-manager-view.tsx                # renamed from clickup-tasks-view.tsx, export TaskManagerView
    status-cards.tsx                     # NEW: SetupCard / NoAccountCard / TaskManagerErrorCard
    (types.ts, bits.tsx, palette.ts, task-progress-card.tsx, ceo-dashboard.tsx,
     ceo-task-table.tsx, department-overview.tsx, manpower-schedule-grid.tsx,
     hod-kanban.tsx, assign-task-form.tsx, recipient-picker.tsx, add-task-button.tsx,
     types.test.ts, README.md)
src/app/task-manager/
  page.tsx                               # NEW: main role-scoped view (auth + AppShell + actions)
  department-overview/page.tsx           # NEW
  manpower-schedule/page.tsx             # NEW
```

Deleted: `src/app/clickup-dashboard/**`, `src/app/tasks/page.tsx`, `src/app/api/clickup/**`, `src/lib/clickup.ts`, `src/lib/clickup-access.ts`, `src/lib/clickup-queries.ts`, `src/lib/clickup.test.ts`, `src/lib/clickup-access.test.ts`, `src/app/components/ClickUpTaskListModal.tsx`.

Modified: `package.json`, `.gitignore`, `next.config.ts`, `Dockerfile`, `.github/workflows/deploy.yml`, `src/app/components/Sidebar.tsx`, `src/app/components/DashboardHome.tsx`, `src/app/components/BranchDashboard.tsx`.

Kept untouched: `src/app/components/StatusDonut.tsx` (LeaveRequestsView uses it), CRM ticket mock platform names, induction training text, OSC's own `prisma/schema.prisma` + `prisma.config.ts` + `src/lib/prisma.ts`.

---

### Task 1: Phase 0 groundwork — install, read the Next 16 docs, record baselines

**Files:** none modified (baseline capture only; scratch file outside the repo).

- [ ] **Step 1: Install dependencies**

Run: `npm install`
Expected: completes without errors; `node_modules/` exists.

- [ ] **Step 2: Read the Next.js 16 guides (AGENTS.md mandate — do not skip)**

List the docs: `ls node_modules/next/dist/docs/`
Read (with the Read tool) the guides covering, at minimum: app router pages/layouts, route handlers, dynamic APIs (`params`/`searchParams`), `next.config`, caching/`force-dynamic`, and server actions. You are checking two things: (a) that the conventions the ported code relies on — Promise-typed `params`/`searchParams` that must be awaited, `export const dynamic = "force-dynamic"`, `"use server"` closures passed as props, `revalidatePath` — still work in Next 16 as they did in 15; (b) whether `serverExternalPackages` is the correct top-level config key in this version. If any guide contradicts an instruction in this plan, the guide wins — note the difference and adapt the affected step.

- [ ] **Step 3: Record the pre-existing typecheck baseline**

Run: `npx tsc --noEmit > "$TEMP/tsc-baseline.txt" 2>&1; wc -l "$TEMP/tsc-baseline.txt"`
Expected: completes (non-zero exit is fine). Note the line count — later tasks only require zero NEW errors mentioning `task-manager` / `src/generated` paths, per the "Typecheck gate" convention above.

- [ ] **Step 4: Confirm the existing test suite passes**

Run: `npm test`
Expected: PASS (all existing suites green). If anything fails here, STOP and report — do not proceed on a broken baseline.

- [ ] **Step 5: Confirm the app builds**

Run: `npm run build`
Expected: build completes successfully.

No commit (nothing changed).

---

### Task 2: Dependencies, scripts, gitignore, next.config

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `next.config.ts`

- [ ] **Step 1: Add dependencies and scripts to package.json**

Add to `"dependencies"` (keep alphabetical order):

```json
    "bullmq": "^5.80.5",
    "ioredis": "^5.11.1",
    "zod": "^3.25.76"
```

Add to `"devDependencies"`:

```json
    "tsx": "^4.23.1"
```

Add to `"scripts"` (after `"test"`):

```json
    "tm:generate": "prisma generate --config prisma.task-manager.config.ts",
    "tm:migrate": "prisma migrate deploy --config prisma.task-manager.config.ts",
    "tm:seed": "tsx --env-file=.env prisma/task-manager/seed.ts",
    "tm:bootstrap": "tsx --env-file=.env prisma/task-manager/bootstrap.ts"
```

Then run: `npm install`
Expected: lockfile updates, installs cleanly.

- [ ] **Step 2: Gitignore the generated client**

Append to `.gitignore` (under the `# misc` section):

```
# task-manager generated prisma client
/src/generated/
```

- [ ] **Step 3: Externalize bullmq/ioredis in next.config.ts**

In `next.config.ts`, add a `serverExternalPackages` key to the config object (sibling of `turbopack`) — Flow's own config externalized these for the same reason (native/server-only deps must not be bundled):

```ts
  // Server-only deps of the task-manager engine — never bundle these.
  serverExternalPackages: ["bullmq", "ioredis"],
```

(If the Next 16 docs read in Task 1 named a different key for this, use that instead and note it.)

- [ ] **Step 4: Verify the app still builds**

Run: `npm run build`
Expected: build completes successfully.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore next.config.ts
git commit -m "chore(task-manager): add deps, tm:* scripts, generated-client gitignore, server externals"
```

---

### Task 3: Second Prisma schema, config, and client singleton

**Files:**
- Create: `prisma/task-manager/schema.prisma` (copied then edited)
- Create: `prisma/task-manager/migrations/**` (copied verbatim)
- Create: `prisma.task-manager.config.ts`
- Create: `src/task-manager/prisma.ts`

- [ ] **Step 1: Copy the schema and migrations from Flow**

```bash
mkdir -p prisma/task-manager
cp /d/ebright-flow/prisma/schema.prisma prisma/task-manager/schema.prisma
cp -r /d/ebright-flow/prisma/migrations prisma/task-manager/migrations
ls prisma/task-manager/migrations | wc -l
```

Expected: 19 entries (18 migration folders + `migration_lock.toml`).

- [ ] **Step 2: Prisma-7-ize the schema header**

In `prisma/task-manager/schema.prisma`, replace the generator/datasource blocks. Old:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

New (custom output so it can never collide with OSC's default client; URL comes from the config file, matching how OSC's own schema works):

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../src/generated/task-manager-client"
}

datasource db {
  provider = "postgresql"
}
```

Touch nothing else in the schema — every model stays byte-identical to Flow's.

- [ ] **Step 3: Create prisma.task-manager.config.ts**

```ts
// Prisma CLI config for the Task Manager schema (second client). Invoked via
// --config by the tm:* npm scripts — OSC's own prisma.config.ts is untouched.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/task-manager/schema.prisma",
  migrations: {
    path: "prisma/task-manager/migrations",
  },
  datasource: {
    // Separate database (ebright_task_manager) on the same Postgres server as
    // DATABASE_URL. Unset in prod until the Phase 2 cutover — pages render a
    // "being set up" card in that state, and generate/typecheck don't need it.
    url: process.env["TASK_MANAGER_DATABASE_URL"] as string,
  },
});
```

- [ ] **Step 4: Generate the client**

Run: `npm run tm:generate`
Expected: "Generated Prisma Client" pointing at `src/generated/task-manager-client`. Verify: `ls src/generated/task-manager-client/index.d.ts` exists.

- [ ] **Step 5: Create the client singleton**

Create `src/task-manager/prisma.ts` — mirrors `src/lib/prisma.ts` (same PG session options, same singleton guard) but on the second client and env var:

```ts
// Task Manager Prisma client — a SECOND client, generated to
// src/generated/task-manager-client, pointed at the separate
// ebright_task_manager database (same Postgres server as DATABASE_URL by
// convention). Session options mirror src/lib/prisma.ts — see the comments
// there for why TimeZone=UTC and the timeouts matter.
import { PrismaClient } from "@/generated/task-manager-client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForTmPrisma = globalThis as unknown as { tmPrisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.TASK_MANAGER_DATABASE_URL,
    options:
      "-c TimeZone=UTC " +
      "-c statement_timeout=60000 " +
      "-c idle_in_transaction_session_timeout=30000",
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForTmPrisma.tmPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForTmPrisma.tmPrisma = prisma;
```

- [ ] **Step 6: Typecheck gate**

Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines (grep exit 1).

- [ ] **Step 7: Commit**

```bash
git add prisma/task-manager prisma.task-manager.config.ts src/task-manager/prisma.ts
git commit -m "feat(task-manager): second Prisma schema + config + adapter-pg singleton"
```

---

### Task 4: Port the shared lib + email templates

**Files:**
- Create: `src/task-manager/lib/api-server.ts` (rewritten, trimmed)
- Create: `src/task-manager/lib/types.ts`, `src/task-manager/lib/item-schemas.ts`, `src/task-manager/lib/users.ts`, `src/task-manager/lib/email.ts`, `src/task-manager/lib/redis.ts` (copies + import rewrites)
- Create: `src/task-manager/lib/queues.ts` (copy + Redis guard)
- Create: `src/task-manager/email/templates.ts`, `src/task-manager/email/templates.test.ts` (copies)

- [ ] **Step 1: Copy the files**

```bash
mkdir -p src/task-manager/lib src/task-manager/email
cp /d/ebright-flow/src/lib/types.ts        src/task-manager/lib/types.ts
cp /d/ebright-flow/src/lib/item-schemas.ts src/task-manager/lib/item-schemas.ts
cp /d/ebright-flow/src/lib/users.ts        src/task-manager/lib/users.ts
cp /d/ebright-flow/src/lib/email.ts        src/task-manager/lib/email.ts
cp /d/ebright-flow/src/lib/redis.ts        src/task-manager/lib/redis.ts
cp /d/ebright-flow/src/lib/queues.ts       src/task-manager/lib/queues.ts
cp /d/ebright-flow/server/email/templates.ts      src/task-manager/email/templates.ts
cp /d/ebright-flow/server/email/templates.test.ts src/task-manager/email/templates.test.ts
```

- [ ] **Step 2: Write the trimmed api-server.ts**

The HTTP pieces (`handleApi`, `jsonError`, `NextResponse`) are bridge-era code with no native caller — only `ApiHttpError` survives (the engine and manpower helpers throw it). Create `src/task-manager/lib/api-server.ts` with exactly:

```ts
// Error type shared by the task-manager engine and data layer. The old HTTP
// bridge's handleApi/jsonError wrappers are gone — data/core.ts's native()
// converts these into FlowBridgeError for the pages instead.
export class ApiHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
```

- [ ] **Step 3: Apply the import-rewrite map**

Edits (per the map in Conventions):
- `lib/types.ts`: `from "@prisma/client"` → `from "@/generated/task-manager-client"`
- `lib/item-schemas.ts`: same `@prisma/client` rewrite
- `lib/users.ts`: `from "./prisma"` → `from "../prisma"`, and `from "@prisma/client"` → `from "@/generated/task-manager-client"`
- `lib/email.ts`, `lib/redis.ts`: no import changes (resend / ioredis only)
- `email/templates.ts` and its test: no import changes (date-fns / vitest / `./templates`)

- [ ] **Step 4: Add the Redis no-op guard to queues.ts**

(The spec's porting table words this as "reminders.ts gains the guard" — the queue factory in `queues.ts` is the correct seam for the same behavior: every caller, including `reminders.ts`, goes through `getReminderQueue()`, and all of them already try/catch it.)

In `src/task-manager/lib/queues.ts`, replace the `getReminderQueue` function body's first line so it throws synchronously when Redis isn't configured. Old:

```ts
export function getReminderQueue(): Queue<ReminderJobData> {
  if (!globalForQueues.reminderQueue) {
```

New:

```ts
export function getReminderQueue(): Queue<ReminderJobData> {
  // No REDIS_URL → reminders are disabled (spec: log-and-skip). Throwing
  // synchronously is safe by design: every engine call site already wraps
  // queue access in try/catch ("a broken queue must not corrupt the run") —
  // without this guard, ioredis would instead retry localhost:6379 forever
  // and hang the calling server action.
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not set — reminder scheduling disabled");
  }
  if (!globalForQueues.reminderQueue) {
```

- [ ] **Step 5: Run the templates test + typecheck gate**

Run: `npx vitest run src/task-manager/email/templates.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines.

- [ ] **Step 6: Commit**

```bash
git add src/task-manager/lib src/task-manager/email
git commit -m "feat(task-manager): port shared lib + email templates, Redis no-op guard"
```

---

### Task 5: Port the engine

**Files:**
- Create: `src/task-manager/engine/run.ts`, `snapshot.ts`, `conditions.ts`, `reminders.ts`
- Create: `src/task-manager/engine/run.advance.test.ts`, `conditions.test.ts`, `reminders.test.ts`, `reminders.process.test.ts`

- [ ] **Step 1: Copy the files**

```bash
mkdir -p src/task-manager/engine
cp /d/ebright-flow/server/engine/run.ts                    src/task-manager/engine/run.ts
cp /d/ebright-flow/server/engine/snapshot.ts               src/task-manager/engine/snapshot.ts
cp /d/ebright-flow/server/engine/conditions.ts             src/task-manager/engine/conditions.ts
cp /d/ebright-flow/server/engine/reminders.ts              src/task-manager/engine/reminders.ts
cp /d/ebright-flow/server/engine/run.advance.test.ts       src/task-manager/engine/run.advance.test.ts
cp /d/ebright-flow/server/engine/conditions.test.ts        src/task-manager/engine/conditions.test.ts
cp /d/ebright-flow/server/engine/reminders.test.ts         src/task-manager/engine/reminders.test.ts
cp /d/ebright-flow/server/engine/reminders.process.test.ts src/task-manager/engine/reminders.process.test.ts
```

(`server/workers/index.ts` is deliberately NOT ported — it returns with the future Redis/reminders phase. Nothing imports it.)

- [ ] **Step 2: Rewrite every import specifier in the engine directory**

Apply the map to all 8 files. From `src/task-manager/engine/`, the concrete rewrites are:
- `"../../src/lib/api-server"` → `"../lib/api-server"`
- `"../../src/lib/item-schemas"` → `"../lib/item-schemas"`
- `"../../src/lib/prisma"` → `"../prisma"`
- `"../../src/lib/queues"` → `"../lib/queues"`
- `"../../src/lib/types"` → `"../lib/types"`
- `"../../src/lib/users"` → `"../lib/users"`
- `"../../src/lib/email"` → `"../lib/email"`
- `"@prisma/client"` → `"@/generated/task-manager-client"`
- `"../email/templates"` → unchanged (email/ is a sibling of engine/ in the new layout too)

CRITICAL: `reminders.ts` contains DYNAMIC imports (`await Promise.all([import("../../src/lib/prisma"), import("../../src/lib/queues"), import("../../src/lib/email"), import("../../src/lib/users")])`) — rewrite those strings too. Test files may contain `vi.mock("...")` calls with the old specifiers — rewrite those identically.

Verify nothing was missed:

```bash
grep -rn '\.\./\.\./src/\|@server/\|from "@prisma/client"\|import("@prisma/client")' src/task-manager/engine/
```

Expected: no output.

- [ ] **Step 3: Run the engine tests**

Run: `npx vitest run src/task-manager/engine/`
Expected: PASS — 4 test files (conditions, reminders decision logic, reminders.process with mocks, run.advance with mocks). These run without Postgres/Redis by design. If a test fails on a module-resolution error, a `vi.mock` specifier was missed in Step 2.

- [ ] **Step 4: Typecheck gate**

Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines. (Most Prisma 6→7 client-API drift, if any exists, surfaces here — fix within the ported files only, keeping behavior identical.)

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/engine
git commit -m "feat(task-manager): port task engine + tests"
```

---

### Task 6: Port the analytics library

**Files:**
- Create: `src/task-manager/analytics/_lib.ts`, `src/task-manager/analytics/_payloads.ts`
- Create: `src/task-manager/analytics/_lib.test.ts` (+ any other `*.test.ts` siblings that exist in the source dir)

- [ ] **Step 1: Copy the files**

```bash
mkdir -p src/task-manager/analytics
cp /d/ebright-flow/src/app/api/analytics/_lib.ts       src/task-manager/analytics/_lib.ts
cp /d/ebright-flow/src/app/api/analytics/_payloads.ts  src/task-manager/analytics/_payloads.ts
cp /d/ebright-flow/src/app/api/analytics/*.test.ts     src/task-manager/analytics/
ls src/task-manager/analytics/
```

(Filenames keep their leading underscore — outside the app router it's meaningless but preserves a zero-churn diff against the source and the tests' `./_lib` imports.)

- [ ] **Step 2: Rewrite imports**

- `_lib.ts`: `"@/lib/prisma"` → `"@/task-manager/prisma"`, `"@/lib/users"` → `"@/task-manager/lib/users"`, `"@prisma/client"` → `"@/generated/task-manager-client"`
- `_payloads.ts`: `"@/lib/users"` → `"@/task-manager/lib/users"` (`"./_lib"` unchanged)
- test files: `"@prisma/client"` → `"@/generated/task-manager-client"` (`"./_lib"` unchanged); rewrite any `vi.mock` specifiers per the map

Verify: `grep -rn '"@/lib/\|from "@prisma/client"' src/task-manager/analytics/`
Expected: no output.

- [ ] **Step 3: Run the analytics tests**

Run: `npx vitest run src/task-manager/analytics/`
Expected: PASS.

- [ ] **Step 4: Typecheck gate**

Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines.

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/analytics
git commit -m "feat(task-manager): port analytics payload library + tests"
```

---

### Task 7: Port the manpower helpers

**Files:**
- Create: `src/task-manager/manpower-helpers.ts` (from `api/internal/_manpower.ts`)
- Create: `src/task-manager/manpower-helpers.test.ts` (from `_manpower.test.ts`)

- [ ] **Step 1: Copy and rename**

```bash
cp /d/ebright-flow/src/app/api/internal/_manpower.ts      src/task-manager/manpower-helpers.ts
cp /d/ebright-flow/src/app/api/internal/_manpower.test.ts src/task-manager/manpower-helpers.test.ts
```

- [ ] **Step 2: Rewrite imports**

In `manpower-helpers.ts`:
- `"@prisma/client"` → `"@/generated/task-manager-client"`
- `"@/lib/api-server"` → `"./lib/api-server"`
- `"@/lib/prisma"` → `"./prisma"`
- `"@server/engine/snapshot"` → `"./engine/snapshot"`
- `"../analytics/_lib"` → `"./analytics/_lib"`

In `manpower-helpers.test.ts`: `"./_manpower"` → `"./manpower-helpers"` (plus the map for any other specifiers).

- [ ] **Step 3: Run the test**

Run: `npx vitest run src/task-manager/manpower-helpers.test.ts`
Expected: PASS (pure-logic tests for `resolveSlotSync`, `roleForColumn`, `nextColumnLabel`, `compareColumns`).

- [ ] **Step 4: Typecheck gate**

Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines.

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/manpower-helpers.ts src/task-manager/manpower-helpers.test.ts
git commit -m "feat(task-manager): port manpower schedule helpers + tests"
```

---

### Task 8: Port the UI package + status cards

The UI package is deliberately self-contained (zero imports outside its own folder, plain Tailwind utilities, no providers) — it copies verbatim except for one file rename, one export rename, and two user-visible strings. It must land before the data layer because the data modules import types from `../ui/types`.

**Files:**
- Create: `src/task-manager/ui/*` (copied from `D:\ebright-flow\src\osc\`, minus `flow-client.ts`)
- Create: `src/task-manager/ui/task-manager-view.tsx` (renamed from `clickup-tasks-view.tsx`)
- Create: `src/task-manager/ui/status-cards.tsx` (new)

- [ ] **Step 1: Copy the package (excluding flow-client.ts) and rename the view**

```bash
mkdir -p src/task-manager/ui
cp /d/ebright-flow/src/osc/*.ts /d/ebright-flow/src/osc/*.tsx /d/ebright-flow/src/osc/README.md src/task-manager/ui/
rm src/task-manager/ui/flow-client.ts
mv src/task-manager/ui/clickup-tasks-view.tsx src/task-manager/ui/task-manager-view.tsx
ls src/task-manager/ui/
```

Expected: 15 files — `add-task-button.tsx`, `assign-task-form.tsx`, `bits.tsx`, `ceo-dashboard.tsx`, `ceo-task-table.tsx`, `department-overview.tsx`, `hod-kanban.tsx`, `manpower-schedule-grid.tsx`, `palette.ts`, `recipient-picker.tsx`, `task-manager-view.tsx`, `task-progress-card.tsx`, `types.test.ts`, `types.ts`, `README.md`. NO `flow-client.ts`.

- [ ] **Step 2: Rename the exported component**

In `src/task-manager/ui/task-manager-view.tsx` (around line 507):

Old: `export function ClickUpTasksView({`
New: `export function TaskManagerView({`

Verify it was the only occurrence: `grep -rn "ClickUpTasksView" src/task-manager/ui/` → expect zero hits in `.tsx`/`.ts` files (README mentions are fine).

- [ ] **Step 3: Fix the two user-visible/behavioral "ClickUp" strings**

In `src/task-manager/ui/task-manager-view.tsx` (around line 844), the rendered helper text:

Old: `(ClickUp-style: status groups, Task/PIC/Due date columns).`
New: `(status groups, Task/PIC/Due date columns).`

In `src/task-manager/ui/task-progress-card.tsx` (around line 19), the default detail link:

Old: `detailHref = "/clickup-tasks",`
New: `detailHref = "/task-manager",`

Then audit the rest: `grep -n "ClickUp" src/task-manager/ui/*.ts src/task-manager/ui/*.tsx` — every remaining hit must be inside a code comment (historical references are fine to keep); if any other hit renders to the user, replace "ClickUp" with "Task Manager" in that string too.

- [ ] **Step 4: Write status-cards.tsx** (complete file — pure presentational, no data-layer imports):

```tsx
// Fallback cards for the Task Manager pages — modeled on the osc-demo
// BridgeErrorCard. Pure presentational: the server pages decide which one to
// render (SetupPendingError → SetupPendingCard, NoAccountError →
// NoAccountCard, anything else → TaskManagerErrorCard).

export function SetupPendingCard() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
      <p className="font-medium">Task Manager is being set up</p>
      <p className="mt-1">
        This environment isn&apos;t connected to the Task Manager database yet.
        Check back soon — no action needed on your side.
      </p>
    </div>
  );
}

export function NoAccountCard({ email }: { email: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
      <p className="font-medium text-gray-800">No Task Manager account yet</p>
      <p className="mt-1">
        There&apos;s no Task Manager account for <span className="font-medium">{email}</span>.
        Ask your admin to add you to the staff roster.
      </p>
    </div>
  );
}

export function TaskManagerErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
      <p className="font-medium">Task Manager error</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}
```

- [ ] **Step 5: Run the package's test + typecheck gate**

Run: `npx vitest run src/task-manager/ui/types.test.ts`
Expected: PASS (`formatDueDate` suite).
Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines.

- [ ] **Step 6: Commit**

```bash
git add src/task-manager/ui
git commit -m "feat(task-manager): port UI package, rename view to TaskManagerView, add status cards"
```

---

### Task 9: Data layer — core (`native()` wrapper + error contract)

The data layer replaces `flow-client.ts`: **same exported function names and signatures, in-process implementation** (each function's body is the corresponding `/api/internal/*` route handler's body, minus `requireInternalSecret` and the HTTP envelope). `native()` reproduces `handleApi`'s error mapping but throws `FlowBridgeError` (what the pages already catch) instead of building an HTTP response.

**Files:**
- Create: `src/task-manager/data/core.ts`

- [ ] **Step 1: Write core.ts** (complete file):

```ts
// Task Manager data layer — core. Replaces the HTTP bridge's flow-client.ts:
// pages/server actions call these functions in-process, so there is no
// x-internal-secret and no FLOW_INTERNAL_URL. The acting user is always
// identified by email (the OSC session's email), resolved against the
// task-manager database's own User table.
import { ZodError, z } from "zod";
import type { User } from "@/generated/task-manager-client";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";

/** Same shape the old flow-client threw — pages branch on status/instance. */
export class FlowBridgeError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "FlowBridgeError";
  }
}

/** Session email has no row in the task-manager User table ("no account yet"). */
export class NoAccountError extends FlowBridgeError {
  constructor(email: string) {
    super(404, `No Task Manager account for ${email}`);
    this.name = "NoAccountError";
  }
}

/** TASK_MANAGER_DATABASE_URL is unset — Phase 2 cutover hasn't run here yet. */
export class SetupPendingError extends FlowBridgeError {
  constructor() {
    super(503, "Task Manager is not connected to its database yet");
    this.name = "SetupPendingError";
  }
}

export const emailSchema = z.string().email().max(200);

/** Resolve the acting user by (lowercased) email — the cross-system identity key. */
export async function requireUserByEmail(email: string): Promise<User> {
  const parsed = emailSchema.parse(email);
  const user = await prisma.user.findUnique({
    where: { email: parsed.toLowerCase() },
  });
  if (!user) throw new NoAccountError(parsed);
  return user;
}

/**
 * Wraps every data-layer function: mirrors the old handleApi error mapping
 * (ApiHttpError → its status, ZodError → 400, unknown → logged 500) but throws
 * FlowBridgeError instead of returning an HTTP response.
 */
export async function native<T>(fn: () => Promise<T>): Promise<T> {
  if (!process.env.TASK_MANAGER_DATABASE_URL) throw new SetupPendingError();
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FlowBridgeError) throw err;
    if (err instanceof ApiHttpError) throw new FlowBridgeError(err.status, err.message);
    if (err instanceof ZodError) {
      const first = err.issues[0];
      throw new FlowBridgeError(
        400,
        `${first?.path?.join(".") || "input"}: ${first?.message || "invalid"}`,
      );
    }
    console.error("[task-manager]", err);
    throw new FlowBridgeError(500, "Internal error");
  }
}
```

- [ ] **Step 2: Typecheck gate**

Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines.

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/data/core.ts
git commit -m "feat(task-manager): data-layer core (native wrapper, error contract)"
```

---

### Task 10: Data layer — read queries + CEO dashboard config

**Files:**
- Create: `src/task-manager/data/queries.ts`
- Create: `src/task-manager/data/ceo.ts`

Bodies are ports of `overview/route.ts`, `detail/route.ts`, `staff/route.ts`, `department-detail/route.ts`, `ceo-dashboard/route.ts` from `D:\ebright-flow\src\app\api\internal\` — compare against the source while writing; behavior must be identical.

- [ ] **Step 1: Write queries.ts** (complete file):

```ts
// Read queries: personal overview, role-scoped detail, staff directory,
// single-department detail. Ports of the corresponding /api/internal routes.
import { z } from "zod";
import type {
  FlowDepartmentDetailResponse,
  FlowDetailResponse,
  FlowOverviewResponse,
  FlowPeriod,
  FlowStaffMember,
} from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { analyticsQuerySchema, canViewEntity, canViewOrg, UNASSIGNED } from "../analytics/_lib";
import {
  getAdhocPayload,
  getAdhocRegionsPayload,
  getEntityPayload,
  getMePayload,
  getOrgPayload,
  resolvedDate,
} from "../analytics/_payloads";
import { native, requireUserByEmail } from "./core";

/** Personal progress for the dashboard card (daily or monthly). */
export function getFlowOverview(
  email: string,
  period: FlowPeriod,
  date?: string,
): Promise<FlowOverviewResponse> {
  return native(async () => {
    const q = analyticsQuerySchema.parse({ period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    const payload = await getMePayload(user, q.period, q.date);
    return { period: q.period, date: resolvedDate(q.date), ...payload } as FlowOverviewResponse;
  });
}

/** Role-scoped detail for the Task Manager page. */
export function getFlowDetail(
  email: string,
  period: FlowPeriod,
  date?: string,
): Promise<FlowDetailResponse> {
  return native(async () => {
    const q = analyticsQuerySchema.parse({ period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    const me = await getMePayload(user, q.period, q.date);

    if (canViewOrg(user.role)) {
      const [org, adhoc, adhocByRegion] = await Promise.all([
        getOrgPayload(q.period, q.date),
        getAdhocPayload(null),
        user.role === "ADMIN" || user.role === "OPS"
          ? getAdhocRegionsPayload()
          : Promise.resolve(undefined),
      ]);
      if (user.role === "OPS") {
        const departmentName = user.department ?? UNASSIGNED;
        const department = await getEntityPayload("department", departmentName, q.period, q.date);
        return {
          kind: "org",
          period: q.period,
          date: resolvedDate(q.date),
          me,
          org,
          adhoc,
          adhocByRegion,
          department: { name: departmentName, ...department },
        } as FlowDetailResponse;
      }
      return {
        kind: "org",
        period: q.period,
        date: resolvedDate(q.date),
        me,
        org,
        adhoc,
        adhocByRegion,
      } as FlowDetailResponse;
    }

    if (user.role === "BRANCH" || user.role === "BRANCH_SITE") {
      const branchName = user.branch ?? UNASSIGNED;
      const [branch, adhoc] = await Promise.all([
        getEntityPayload("branch", branchName, q.period, q.date),
        user.role === "BRANCH" ? getAdhocPayload(branchName) : Promise.resolve(null),
      ]);
      return {
        kind: "branch",
        period: q.period,
        date: resolvedDate(q.date),
        me,
        branch: { name: branchName, ...branch },
        adhoc,
      } as FlowDetailResponse;
    }

    if (user.role === "HOD" || user.role === "DEPT_SITE") {
      const departmentName = user.department ?? UNASSIGNED;
      const department = await getEntityPayload("department", departmentName, q.period, q.date);
      return {
        kind: "department",
        period: q.period,
        date: resolvedDate(q.date),
        me,
        department: { name: departmentName, ...department },
      } as FlowDetailResponse;
    }

    return {
      kind: "member",
      period: q.period,
      date: resolvedDate(q.date),
      me,
    } as FlowDetailResponse;
  });
}

/** Assignable staff directory (recipient picker options). */
export function getFlowStaff(): Promise<{ staff: FlowStaffMember[] }> {
  return native(async () => {
    const users = await prisma.user.findMany({
      where: { role: { in: ["CEO", "HOD", "BRANCH", "MEMBER"] } },
      orderBy: { name: "asc" },
    });
    return {
      staff: users.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        department: u.department,
        branch: u.branch,
        employmentType: u.employmentType,
        coachSchedule: u.coachSchedule,
      })) as FlowStaffMember[],
    };
  });
}

const departmentQuerySchema = analyticsQuerySchema.extend({
  department: z.string().min(1).max(200),
});

/** Full detail for ONE department by name (org roles any; HOD own only). */
export function getDepartmentDetail(
  email: string,
  department: string,
  period: FlowPeriod,
  date?: string,
): Promise<FlowDepartmentDetailResponse> {
  return native(async () => {
    const q = departmentQuerySchema.parse({ department, period, ...(date ? { date } : {}) });
    const user = await requireUserByEmail(email);
    if (!canViewEntity(user, "department", q.department)) {
      throw new ApiHttpError(403, "You can only view your own department");
    }
    const payload = await getEntityPayload("department", q.department, q.period, q.date);
    return {
      period: q.period,
      date: resolvedDate(q.date),
      department: { name: q.department, ...payload },
    } as FlowDepartmentDetailResponse;
  });
}
```

- [ ] **Step 2: Write ceo.ts** (complete file):

```ts
// CEO pinned-department dashboard config (per-cadence). Port of
// /api/internal/ceo-dashboard (GET + PUT).
import { z } from "zod";
import type { FlowCeoDashboardConfig, FlowPeriod } from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { DEPARTMENTS } from "../analytics/_lib";
import { native, requireUserByEmail } from "./core";

const cadenceSchema = z.enum(["daily", "monthly"]);

function parseDepartments(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((d): d is string => typeof d === "string");
}

async function requireCeo(email: string) {
  const user = await requireUserByEmail(email);
  if (user.role !== "CEO") {
    throw new ApiHttpError(403, "Only the CEO has a customizable department dashboard");
  }
  return user;
}

export function getCeoDashboardConfig(
  email: string,
  cadence: FlowPeriod,
): Promise<FlowCeoDashboardConfig> {
  return native(async () => {
    const parsedCadence = cadenceSchema.parse(cadence);
    const user = await requireCeo(email);
    const config = await prisma.ceoDashboardConfig.findUnique({
      where: { userId_cadence: { userId: user.id, cadence: parsedCadence } },
    });
    // First-ever load for this cadence: default to all 6 official departments,
    // persisted immediately. Once the CEO has saved ANY config (including an
    // empty one), that choice is respected and never auto-reset.
    if (!config) {
      const departments = [...DEPARTMENTS];
      await prisma.ceoDashboardConfig.create({
        data: { userId: user.id, cadence: parsedCadence, departments },
      });
      return { departments } as FlowCeoDashboardConfig;
    }
    return { departments: parseDepartments(config.departments) } as FlowCeoDashboardConfig;
  });
}

const saveSchema = z.object({
  cadence: cadenceSchema,
  departments: z.array(z.enum(DEPARTMENTS as [string, ...string[]])).max(DEPARTMENTS.length),
});

/** Replaces the CEO's whole pinned-department list/order for ONE cadence. */
export function saveCeoDashboardConfig(
  email: string,
  cadence: FlowPeriod,
  departments: string[],
): Promise<FlowCeoDashboardConfig> {
  return native(async () => {
    const body = saveSchema.parse({ cadence, departments });
    const user = await requireCeo(email);
    // De-dupe while preserving order.
    const deduped = [...new Set(body.departments)];
    await prisma.ceoDashboardConfig.upsert({
      where: { userId_cadence: { userId: user.id, cadence: body.cadence } },
      create: { userId: user.id, cadence: body.cadence, departments: deduped },
      update: { departments: deduped },
    });
    return { departments: deduped } as FlowCeoDashboardConfig;
  });
}
```

- [ ] **Step 3: Typecheck gate**

Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines (`../ui/types` exists — it landed in Task 8).

- [ ] **Step 4: Commit**

```bash
git add src/task-manager/data/queries.ts src/task-manager/data/ceo.ts
git commit -m "feat(task-manager): data-layer read queries + CEO dashboard config"
```

---

### Task 11: Data layer — task actions (assign / complete / skip / reopen)

**Files:**
- Create: `src/task-manager/data/tasks.ts`

Bodies are ports of `assign/route.ts`, `complete-task/route.ts`, `skip-task/route.ts`, `reopen-task/route.ts`. The assign route's long header comment explains the 5-utility-flow model — read it in the source before porting.

- [ ] **Step 1: Write tasks.ts** (complete file):

```ts
// Task actions: the "+ Task" quick-assign fan-out and the status-dot
// complete / N/A / reopen mutations. Ports of the corresponding
// /api/internal routes; all reuse the REAL engine paths (submitItem/
// completeBlock/skipBlock/reopenBlock) so audit logs, run auto-completion,
// and reminder cancellation still happen. See assign/route.ts's header
// comment in the source repo for the full cadence/utility-flow rationale.
import { z } from "zod";
import type { Cadence, Prisma } from "@/generated/task-manager-client";
import type { FlowAssignInput } from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { buildTemplateSnapshot } from "../engine/snapshot";
import { completeBlock, reopenBlock, skipBlock, submitItem } from "../engine/run";
import { BRANCH_STAFF_ROLES, parseLocalDate } from "../analytics/_lib";
import { native, requireUserByEmail } from "./core";

const CADENCE_OPTIONS = ["daily", "monthly", "adhoc"] as const;
type CadenceOption = (typeof CADENCE_OPTIONS)[number];

/** Mirrors visibleCadenceOptions in ui/types.ts — re-validated server-side so
 *  a crafted request can't submit a cadence the picker wouldn't have offered. */
function allowedCadenceOptions(targets: { employmentType: string | null }[]): CadenceOption[] {
  if (targets.some((t) => t.employmentType === "Manager")) return ["daily", "monthly", "adhoc"];
  if (targets.some((t) => t.employmentType === "Coach" || t.employmentType === "Branch Exec")) {
    return ["daily"];
  }
  return ["daily", "monthly"];
}

const CADENCE_ENUM: Record<CadenceOption, Cadence> = {
  daily: "DAILY",
  monthly: "MONTHLY",
  adhoc: "ADHOC",
};

const DAYS = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_INDEX: Record<(typeof DAYS)[number], number> = {
  Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
};

const assignInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  branches: z.array(z.string().min(1).max(100)).max(50).default([]),
  role: z.enum(["All", ...BRANCH_STAFF_ROLES]).default("All"),
  days: z.array(z.enum(DAYS)).max(DAYS.length).default([]),
  userIds: z.array(z.string().min(1).max(100)).max(100).default([]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cadence: z.enum(CADENCE_OPTIONS),
});

const ADHOC_FLOW_ID = "flow-adhoc";
const CEO_ASSIGN_FLOW_ID = "flow-ceo-assign";
const HOD_ASSIGN_FLOW_ID = "flow-hod-assign";
const ADMIN_ASSIGN_FLOW_ID = "flow-admin-assign";
const OPS_ASSIGN_FLOW_ID = "flow-ops-assign";
const DUE_HOUR = 17;

function nextOccurrence(day: (typeof DAYS)[number], from = new Date()): Date {
  const diff = (DAY_INDEX[day] - from.getDay() + 7) % 7;
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + diff, DUE_HOUR);
}

/** The Operation department-site login is the ONE DEPT_SITE with assign rights. */
function isOperationDeptSite(actor: { role: string; department: string | null }): boolean {
  return actor.role === "DEPT_SITE" && actor.department === "Operation";
}

/** The "+ Task" quick form: one RunBlock per (recipient × occurrence). */
export function assignFlowTask(
  actorEmail: string,
  input: FlowAssignInput,
): Promise<{ created: number }> {
  return native(async () => {
    const body = assignInputSchema.parse(input);
    const actor = await requireUserByEmail(actorEmail);
    const allowed =
      actor.role === "ADMIN" ||
      actor.role === "OPS" ||
      actor.role === "CEO" ||
      actor.role === "HOD" ||
      isOperationDeptSite(actor);
    if (!allowed) {
      throw new ApiHttpError(
        403,
        "Only superadmin, operations, HOD, the CEO, or the Operation department account can assign tasks",
      );
    }

    const roles = body.role === "All" ? [...BRANCH_STAFF_ROLES] : [body.role];
    const targets = await prisma.user.findMany({
      where:
        body.userIds.length > 0
          ? { id: { in: body.userIds } }
          : {
              employmentType: { in: roles },
              ...(body.branches.length > 0 ? { branch: { in: body.branches } } : {}),
            },
      orderBy: { name: "asc" },
    });
    if (targets.length === 0) {
      throw new ApiHttpError(400, "No staff match that selection");
    }
    const allowedCadences = allowedCadenceOptions(targets);
    if (!allowedCadences.includes(body.cadence)) {
      throw new ApiHttpError(
        400,
        `${allowedCadences.join("/")} ${allowedCadences.length > 1 ? "are" : "is"} the only cadence option${allowedCadences.length > 1 ? "s" : ""} for this recipient selection`,
      );
    }

    const flowId =
      actor.role === "CEO"
        ? CEO_ASSIGN_FLOW_ID
        : actor.role === "HOD"
          ? HOD_ASSIGN_FLOW_ID
          : actor.role === "OPS"
            ? OPS_ASSIGN_FLOW_ID
            : actor.role === "ADMIN" || isOperationDeptSite(actor)
              ? ADMIN_ASSIGN_FLOW_ID
              : ADHOC_FLOW_ID; // unreachable given the allow-list — safe fallback only
    const flow = await prisma.flow.findUnique({
      where: { id: flowId },
      include: { blocks: { include: { items: true } } },
    });
    const block = flow?.blocks[0];
    if (!flow || !block) {
      throw new ApiHttpError(500, "Assignment utility flow missing — run the seed/bootstrap");
    }
    const snapshot = (await buildTemplateSnapshot(flow.id)) as unknown as Prisma.InputJsonValue;

    let occurrences: { dueAt: Date | null; runName: string }[];
    if (body.dueDate) {
      const d = parseLocalDate(body.dueDate);
      occurrences = [
        { dueAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), DUE_HOUR), runName: body.title },
      ];
    } else if (body.days.length > 0) {
      occurrences = body.days.map((day) => ({
        dueAt: nextOccurrence(day),
        runName: `${body.title} (${day})`,
      }));
    } else {
      occurrences = [{ dueAt: null, runName: body.title }];
    }
    const cadence: Cadence = CADENCE_ENUM[body.cadence];

    const pairs = targets.flatMap((target) => occurrences.map((occ) => ({ target, occ })));
    const runIds = await Promise.all(
      pairs.map(async ({ target, occ }) => {
        const run = await prisma.flowRun.create({
          data: {
            flowId: flow.id,
            flowVersion: flow.version,
            templateSnapshot: snapshot,
            name: `${occ.runName} — ${target.name}`,
            startedById: actor.id,
            triggerType: "MANUAL",
            status: "ACTIVE",
          },
        });
        await prisma.runBlock.create({
          data: {
            runId: run.id,
            blockId: block.id,
            nodeId: block.nodeId,
            title: body.title,
            assigneeId: target.id,
            status: "ACTIVE",
            startedAt: new Date(),
            dueAt: occ.dueAt,
            cadence,
            runItems: {
              create: block.items.map((it) => ({
                itemId: it.id,
                order: it.order,
                type: it.type,
                label: it.label,
                required: it.required,
                config: it.config as Prisma.InputJsonValue,
              })),
            },
          },
        });
        await prisma.auditLog.create({
          data: {
            runId: run.id,
            actorId: actor.id,
            action: "RUN_STARTED",
            detail: {
              runName: occ.runName,
              trigger: "MANUAL",
              adhoc: flowId === ADHOC_FLOW_ID,
              assignee: target.name,
            },
          },
        });
        return run.id;
      }),
    );

    return { created: runIds.length };
  });
}

/** Click-to-complete: assignee-only, single-required-CHECKBOX tasks only. */
export function completeFlowTask(
  actorEmail: string,
  runBlockId: string,
): Promise<{ completed: boolean; runBlockId: string; runCompleted: boolean }> {
  return native(async () => {
    const id = z.string().min(1).parse(runBlockId);
    const user = await requireUserByEmail(actorEmail);

    const runBlock = await prisma.runBlock.findUnique({
      where: { id },
      include: { runItems: true },
    });
    if (!runBlock) throw new ApiHttpError(404, "Task not found");
    if (runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only complete your own tasks");
    }

    // Re-verify eligibility server-side — never trust the client's view.
    const required = runBlock.runItems.filter((it) => it.required);
    if (required.length !== 1 || required[0].type !== "CHECKBOX") {
      throw new ApiHttpError(400, "This task can't be quick-completed — open it in the full run view.");
    }

    await submitItem({
      runId: runBlock.runId,
      runBlockId: runBlock.id,
      runItemId: required[0].id,
      value: { type: "CHECKBOX", checked: true },
      actorId: user.id,
    });
    const result = await completeBlock({
      runId: runBlock.runId,
      runBlockId: runBlock.id,
      actorId: user.id,
    });

    return { completed: true, ...result } as {
      completed: boolean;
      runBlockId: string;
      runCompleted: boolean;
    };
  });
}

/** Status dropdown "N/A": assignee-only, any of the caller's own non-terminal tasks. */
export function skipFlowTask(
  actorEmail: string,
  runBlockId: string,
): Promise<{ skipped: boolean; runBlockId: string; runCompleted: boolean }> {
  return native(async () => {
    const id = z.string().min(1).parse(runBlockId);
    const user = await requireUserByEmail(actorEmail);

    const runBlock = await prisma.runBlock.findUnique({ where: { id } });
    if (!runBlock) throw new ApiHttpError(404, "Task not found");
    if (runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only mark your own tasks N/A");
    }

    const result = await skipBlock({
      runId: runBlock.runId,
      runBlockId: runBlock.id,
      actorId: user.id,
    });

    return { skipped: true, ...result } as {
      skipped: boolean;
      runBlockId: string;
      runCompleted: boolean;
    };
  });
}

/** Status dropdown "Pending" on a Completed/N-A task: assignee-only reopen. */
export function reopenFlowTask(
  actorEmail: string,
  runBlockId: string,
): Promise<{ reopened: boolean; runBlockId: string; runReopened: boolean }> {
  return native(async () => {
    const id = z.string().min(1).parse(runBlockId);
    const user = await requireUserByEmail(actorEmail);

    const runBlock = await prisma.runBlock.findUnique({ where: { id } });
    if (!runBlock) throw new ApiHttpError(404, "Task not found");
    if (runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only reopen your own tasks");
    }

    const result = await reopenBlock({
      runId: runBlock.runId,
      runBlockId: runBlock.id,
      actorId: user.id,
    });

    return { reopened: true, ...result } as {
      reopened: boolean;
      runBlockId: string;
      runReopened: boolean;
    };
  });
}
```

Note the one deliberate divergence from the route: `assignFlowTask` returns `{ created }` only (the old bridge's declared type) — the route's extra `runIds` field was never part of the flow-client contract, and returning it would trip TS excess-property checking against the declared return type.

- [ ] **Step 2: Typecheck gate**

Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines. (If `completeBlock`/`skipBlock`/`reopenBlock` result shapes differ from the casts, align the cast with the engine's actual return type — the source of truth is `src/task-manager/engine/run.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/data/tasks.ts
git commit -m "feat(task-manager): data-layer task actions (assign/complete/skip/reopen)"
```

---

### Task 12: Data layer — manpower schedule

**Files:**
- Create: `src/task-manager/data/manpower.ts`

Bodies are ports of the 5 route files under `D:\ebright-flow\src\app\api\internal\manpower-schedule\`.

- [ ] **Step 1: Write manpower.ts** (complete file):

```ts
// Manpower Schedule (branch staffing grid): read/create the day grid, add/
// rename/delete time rows, add/delete seat columns, assign cells, publish.
// Ports of the /api/internal/manpower-schedule/* routes. Reads are open to
// anyone on the branch (canEdit tells the UI); writes are branch-manager-only
// via requireEditableSchedule.
import { z } from "zod";
import type { FlowManpowerScheduleResponse } from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { parseLocalDate } from "../analytics/_lib";
import {
  cancelSlotRun,
  compareColumns,
  createSlotRun,
  loadAdhocFlow,
  nextColumnLabel,
  requireEditableSchedule,
  resolveSlotSync,
  roleForColumn,
} from "../manpower-helpers";
import { native, requireUserByEmail } from "./core";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function assertOrder(startTime: string, endTime: string) {
  if (startTime >= endTime) {
    throw new ApiHttpError(400, "Start time must be before end time");
  }
}

async function loadGrid(branch: string, date: string) {
  const schedule = await prisma.manpowerSchedule.findUnique({
    where: { branch_date: { branch, date } },
    include: { slots: true },
  });
  if (!schedule) return null;

  const staffIds = [
    ...new Set(
      schedule.slots.map((s) => s.assignedStaffId).filter((id): id is string => id !== null),
    ),
  ];
  const staff = staffIds.length
    ? await prisma.user.findMany({ where: { id: { in: staffIds } } })
    : [];
  const nameById = new Map(staff.map((u) => [u.id, u.name]));

  return {
    id: schedule.id,
    branch: schedule.branch,
    date: schedule.date,
    status: schedule.status,
    cells: [...schedule.slots]
      .sort((a, b) => {
        const t = a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime);
        return t !== 0 ? t : compareColumns(a.roleColumn, b.roleColumn);
      })
      .map((s) => ({
        slotId: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        roleColumn: s.roleColumn,
        assignedStaffId: s.assignedStaffId,
        assignedStaffName: s.assignedStaffId ? (nameById.get(s.assignedStaffId) ?? null) : null,
        synced: s.runBlockId !== null,
      })),
  };
}

export function getManpowerSchedule(
  email: string,
  date: string,
): Promise<FlowManpowerScheduleResponse> {
  return native(async () => {
    const parsedDate = z.string().regex(DATE_RE).parse(date);
    const actor = await requireUserByEmail(email);
    if (!actor.branch) {
      return { schedule: null, canEdit: false } as FlowManpowerScheduleResponse;
    }
    return {
      schedule: await loadGrid(actor.branch, parsedDate),
      canEdit: actor.role === "BRANCH",
    } as FlowManpowerScheduleResponse;
  });
}

export function createManpowerSchedule(
  email: string,
  date: string,
): Promise<FlowManpowerScheduleResponse> {
  return native(async () => {
    const parsedDate = z.string().regex(DATE_RE).parse(date);
    const actor = await requireUserByEmail(email);
    if (actor.role !== "BRANCH" || !actor.branch) {
      throw new ApiHttpError(403, "Only a branch manager can create a schedule");
    }
    const existing = await prisma.manpowerSchedule.findUnique({
      where: { branch_date: { branch: actor.branch, date: parsedDate } },
    });
    if (!existing) {
      await prisma.manpowerSchedule.create({
        data: {
          branch: actor.branch,
          date: parsedDate,
          createdById: actor.id,
          slots: { create: [{ startTime: "09:00", endTime: "10:00", roleColumn: "Manager" }] },
        },
      });
    }
    return {
      schedule: await loadGrid(actor.branch, parsedDate),
      canEdit: true,
    } as FlowManpowerScheduleResponse;
  });
}

export function addScheduleRow(
  email: string,
  scheduleId: string,
  startTime: string,
  endTime: string,
): Promise<{ ok: true }> {
  return native(async () => {
    const body = z
      .object({
        scheduleId: z.string().min(1),
        startTime: z.string().regex(TIME_RE),
        endTime: z.string().regex(TIME_RE),
      })
      .parse({ scheduleId, startTime, endTime });
    assertOrder(body.startTime, body.endTime);
    const actor = await requireUserByEmail(email);
    await requireEditableSchedule(actor, body.scheduleId);

    const existing = await prisma.scheduleSlot.findMany({
      where: { scheduleId: body.scheduleId },
      distinct: ["roleColumn"],
      select: { roleColumn: true },
    });
    if (existing.length === 0) {
      throw new ApiHttpError(400, "Add at least one seat column before adding a row");
    }
    await prisma.scheduleSlot.createMany({
      data: existing.map((c) => ({
        scheduleId: body.scheduleId,
        startTime: body.startTime,
        endTime: body.endTime,
        roleColumn: c.roleColumn,
      })),
    });
    return { ok: true as const };
  });
}

export function renameScheduleRow(
  email: string,
  scheduleId: string,
  oldStartTime: string,
  oldEndTime: string,
  newStartTime: string,
  newEndTime: string,
): Promise<{ ok: true }> {
  return native(async () => {
    const body = z
      .object({
        scheduleId: z.string().min(1),
        oldStartTime: z.string().regex(TIME_RE),
        oldEndTime: z.string().regex(TIME_RE),
        newStartTime: z.string().regex(TIME_RE),
        newEndTime: z.string().regex(TIME_RE),
      })
      .parse({ scheduleId, oldStartTime, oldEndTime, newStartTime, newEndTime });
    assertOrder(body.newStartTime, body.newEndTime);
    const actor = await requireUserByEmail(email);
    await requireEditableSchedule(actor, body.scheduleId);

    const slots = await prisma.scheduleSlot.findMany({
      where: { scheduleId: body.scheduleId, startTime: body.oldStartTime, endTime: body.oldEndTime },
    });
    if (slots.length === 0) throw new ApiHttpError(404, "Row not found");

    for (const slot of slots) {
      await prisma.scheduleSlot.update({
        where: { id: slot.id },
        data: { startTime: body.newStartTime, endTime: body.newEndTime },
      });
      // Update the linked task in place — same slot, same assignee, new time.
      if (slot.runBlockId) {
        const blockTitle = `${slot.roleColumn} shift (${body.newStartTime}–${body.newEndTime})`;
        const d = parseLocalDate(
          (await prisma.manpowerSchedule.findUniqueOrThrow({ where: { id: body.scheduleId } })).date,
        );
        const [endHour, endMinute] = body.newEndTime.split(":").map(Number);
        const dueAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), endHour, endMinute);
        const runBlock = await prisma.runBlock.update({
          where: { id: slot.runBlockId },
          data: { title: blockTitle, dueAt },
        });
        const assignee = await prisma.user.findUnique({ where: { id: runBlock.assigneeId } });
        await prisma.flowRun.update({
          where: { id: runBlock.runId },
          data: { name: `${blockTitle} — ${assignee?.name ?? "Staff"}` },
        });
      }
    }
    return { ok: true as const };
  });
}

export function deleteScheduleRow(
  email: string,
  scheduleId: string,
  startTime: string,
  endTime: string,
): Promise<{ ok: true }> {
  return native(async () => {
    const body = z
      .object({
        scheduleId: z.string().min(1),
        startTime: z.string().regex(TIME_RE),
        endTime: z.string().regex(TIME_RE),
      })
      .parse({ scheduleId, startTime, endTime });
    const actor = await requireUserByEmail(email);
    await requireEditableSchedule(actor, body.scheduleId);

    const slots = await prisma.scheduleSlot.findMany({
      where: { scheduleId: body.scheduleId, startTime: body.startTime, endTime: body.endTime },
    });
    for (const slot of slots) {
      if (slot.runBlockId) await cancelSlotRun(slot.runBlockId, actor.id);
    }
    await prisma.scheduleSlot.deleteMany({
      where: { scheduleId: body.scheduleId, startTime: body.startTime, endTime: body.endTime },
    });
    return { ok: true as const };
  });
}

export function addScheduleColumn(
  email: string,
  scheduleId: string,
  kind: "Coach" | "Exec",
): Promise<{ roleColumn: string }> {
  return native(async () => {
    const body = z
      .object({ scheduleId: z.string().min(1), kind: z.enum(["Coach", "Exec"]) })
      .parse({ scheduleId, kind });
    const actor = await requireUserByEmail(email);
    await requireEditableSchedule(actor, body.scheduleId);

    const rows = await prisma.scheduleSlot.findMany({
      where: { scheduleId: body.scheduleId },
      distinct: ["startTime", "endTime"],
      select: { startTime: true, endTime: true },
    });
    if (rows.length === 0) {
      throw new ApiHttpError(400, "Add at least one time row before adding a seat");
    }
    const existingColumns = (
      await prisma.scheduleSlot.findMany({
        where: { scheduleId: body.scheduleId },
        distinct: ["roleColumn"],
        select: { roleColumn: true },
      })
    ).map((c) => c.roleColumn);
    const roleColumn = nextColumnLabel(existingColumns, body.kind);

    await prisma.scheduleSlot.createMany({
      data: rows.map((r) => ({
        scheduleId: body.scheduleId,
        startTime: r.startTime,
        endTime: r.endTime,
        roleColumn,
      })),
    });
    return { roleColumn };
  });
}

export function deleteScheduleColumn(
  email: string,
  scheduleId: string,
  roleColumn: string,
): Promise<{ ok: true }> {
  return native(async () => {
    const body = z
      .object({ scheduleId: z.string().min(1), roleColumn: z.string().min(1) })
      .parse({ scheduleId, roleColumn });
    if (body.roleColumn === "Manager") {
      throw new ApiHttpError(400, "The Manager seat can't be removed");
    }
    const actor = await requireUserByEmail(email);
    await requireEditableSchedule(actor, body.scheduleId);

    const columnCount = (
      await prisma.scheduleSlot.findMany({
        where: { scheduleId: body.scheduleId },
        distinct: ["roleColumn"],
        select: { roleColumn: true },
      })
    ).length;
    if (columnCount <= 1) {
      throw new ApiHttpError(400, "The schedule needs at least one seat column");
    }

    const slots = await prisma.scheduleSlot.findMany({
      where: { scheduleId: body.scheduleId, roleColumn: body.roleColumn },
    });
    for (const slot of slots) {
      if (slot.runBlockId) await cancelSlotRun(slot.runBlockId, actor.id);
    }
    await prisma.scheduleSlot.deleteMany({
      where: { scheduleId: body.scheduleId, roleColumn: body.roleColumn },
    });
    return { ok: true as const };
  });
}

export function assignScheduleCell(
  email: string,
  slotId: string,
  assignedStaffId: string | null,
): Promise<{
  slotId: string;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  synced: boolean;
}> {
  return native(async () => {
    const body = z
      .object({ slotId: z.string().min(1), assignedStaffId: z.string().min(1).nullable() })
      .parse({ slotId, assignedStaffId });
    const actor = await requireUserByEmail(email);

    const slot = await prisma.scheduleSlot.findUnique({ where: { id: body.slotId } });
    if (!slot) throw new ApiHttpError(404, "Slot not found");
    const schedule = await requireEditableSchedule(actor, slot.scheduleId);

    let assignee = null as Awaited<ReturnType<typeof prisma.user.findUnique>>;
    if (body.assignedStaffId) {
      assignee = await prisma.user.findUnique({ where: { id: body.assignedStaffId } });
      if (!assignee || assignee.branch !== actor.branch) {
        throw new ApiHttpError(400, "Pick a staff member from your branch");
      }
      const expectedRole = roleForColumn(slot.roleColumn);
      if (expectedRole && assignee.employmentType !== expectedRole) {
        throw new ApiHttpError(400, `${slot.roleColumn} needs a ${expectedRole}`);
      }
    }

    const action = resolveSlotSync(slot.runBlockId, slot.assignedStaffId, body.assignedStaffId);
    let runBlockId = slot.runBlockId;

    if (schedule.status === "PUBLISHED") {
      if (action.kind === "cancel" || action.kind === "replace") {
        if (slot.runBlockId) await cancelSlotRun(slot.runBlockId, actor.id);
        runBlockId = null;
      }
      if ((action.kind === "create" || action.kind === "replace") && assignee) {
        const adhoc = await loadAdhocFlow();
        runBlockId = await createSlotRun(adhoc, {
          slotId: slot.id,
          roleColumn: slot.roleColumn,
          startTime: slot.startTime,
          endTime: slot.endTime,
          date: schedule.date,
          assigneeId: assignee.id,
          assigneeName: assignee.name,
          actorId: actor.id,
        });
      }
    }

    await prisma.scheduleSlot.update({
      where: { id: slot.id },
      data: { assignedStaffId: body.assignedStaffId, runBlockId },
    });

    return {
      slotId: slot.id,
      assignedStaffId: body.assignedStaffId,
      assignedStaffName: assignee?.name ?? null,
      synced: runBlockId !== null,
    };
  });
}

export function publishSchedule(
  email: string,
  scheduleId: string,
): Promise<{ ok: true; synced: number }> {
  return native(async () => {
    const body = z.object({ scheduleId: z.string().min(1) }).parse({ scheduleId });
    const actor = await requireUserByEmail(email);
    const schedule = await requireEditableSchedule(actor, body.scheduleId);
    if (schedule.status === "PUBLISHED") {
      throw new ApiHttpError(400, "Already published");
    }

    const toSync = await prisma.scheduleSlot.findMany({
      where: { scheduleId: body.scheduleId, assignedStaffId: { not: null }, runBlockId: null },
    });

    if (toSync.length > 0) {
      const assignees = await prisma.user.findMany({
        where: { id: { in: toSync.map((s) => s.assignedStaffId as string) } },
      });
      const nameById = new Map(assignees.map((u) => [u.id, u.name]));
      const adhoc = await loadAdhocFlow();
      for (const slot of toSync) {
        const assigneeId = slot.assignedStaffId as string;
        const runBlockId = await createSlotRun(adhoc, {
          slotId: slot.id,
          roleColumn: slot.roleColumn,
          startTime: slot.startTime,
          endTime: slot.endTime,
          date: schedule.date,
          assigneeId,
          assigneeName: nameById.get(assigneeId) ?? "Staff",
          actorId: actor.id,
        });
        await prisma.scheduleSlot.update({ where: { id: slot.id }, data: { runBlockId } });
      }
    }

    await prisma.manpowerSchedule.update({
      where: { id: body.scheduleId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    return { ok: true as const, synced: toSync.length };
  });
}
```

- [ ] **Step 2: Typecheck gate**

Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines. (If `FlowManpowerScheduleResponse`'s `schedule` shape disagrees with `loadGrid`'s return, the source of truth is `src/task-manager/ui/types.ts` — adjust the cast site, never the type.)

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/data/manpower.ts
git commit -m "feat(task-manager): data-layer manpower schedule functions"
```

---

### Task 13: Data layer — HOD kanban + the barrel

**Files:**
- Create: `src/task-manager/data/kanban.ts`
- Create: `src/task-manager/data.ts` (barrel)

Bodies are ports of the 4 route files under `D:\ebright-flow\src\app\api\internal\hod-kanban\`.

- [ ] **Step 1: Write kanban.ts** (complete file):

```ts
// HOD "My Board" — a freeform personal kanban, NOT the task engine. Owner-only
// everywhere. Ports of the /api/internal/hod-kanban/* routes. `order` is a
// float (fractional indexing): the client computes the new value on drag and
// sends it straight through.
import { z } from "zod";
import type { FlowKanbanCard, FlowKanbanColumnColor, FlowKanbanColumnDef } from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { native, requireUserByEmail } from "./core";

// Ids are scoped per owner — HodKanbanColumn.id is a global primary key, so
// the lazy-init defaults embed the owner id (see the route's comment on why a
// flat "PENDING" literal would break every HOD after the first).
function initialColumns(ownerId: string) {
  return [
    { id: `PENDING-${ownerId}`, label: "Pending", order: 1 },
    { id: `IN_PROGRESS-${ownerId}`, label: "In Progress", order: 2 },
    { id: `COMPLETED-${ownerId}`, label: "Completed", order: 3 },
  ];
}

async function requireHod(email: string) {
  const user = await requireUserByEmail(email);
  if (user.role !== "HOD") {
    throw new ApiHttpError(403, "Only an HOD has a personal board");
  }
  return user;
}

/** A card's `column` must be an existing column row owned by this same HOD. */
async function requireValidColumn(ownerId: string, column: string): Promise<void> {
  const owned = await prisma.hodKanbanColumn.findFirst({ where: { id: column, ownerId } });
  if (!owned) throw new ApiHttpError(404, "Column not found");
}

async function requireOwnedCard(email: string, cardId: string) {
  const user = await requireHod(email);
  const card = await prisma.hodKanbanCard.findUnique({ where: { id: cardId } });
  if (!card || card.ownerId !== user.id) {
    throw new ApiHttpError(404, "Card not found");
  }
  return { user, card };
}

async function requireOwnedColumn(email: string, columnId: string) {
  const user = await requireHod(email);
  const column = await prisma.hodKanbanColumn.findUnique({ where: { id: columnId } });
  if (!column || column.ownerId !== user.id) {
    throw new ApiHttpError(404, "Column not found");
  }
  return { user, column };
}

// Mirrors HOD_KANBAN_COLORS in ui/types.ts — duplicated deliberately, same as
// the route did, so the UI package stays import-free of the data layer.
const KANBAN_COLUMN_COLORS = ["blue", "indigo", "violet", "pink", "orange", "teal", "rose"] as const;

export function getHodKanban(
  email: string,
): Promise<{ cards: FlowKanbanCard[]; columns: FlowKanbanColumnDef[] }> {
  return native(async () => {
    const user = await requireHod(email);

    let columns = await prisma.hodKanbanColumn.findMany({
      where: { ownerId: user.id },
      orderBy: { order: "asc" },
    });
    if (columns.length === 0) {
      // skipDuplicates guards a race between two concurrent first-loads.
      await prisma.hodKanbanColumn.createMany({
        data: initialColumns(user.id).map((c) => ({ ...c, ownerId: user.id })),
        skipDuplicates: true,
      });
      columns = await prisma.hodKanbanColumn.findMany({
        where: { ownerId: user.id },
        orderBy: { order: "asc" },
      });
    }

    const cards = await prisma.hodKanbanCard.findMany({
      where: { ownerId: user.id },
      orderBy: { order: "asc" },
    });
    return {
      cards: cards as unknown as FlowKanbanCard[],
      columns: columns as unknown as FlowKanbanColumnDef[],
    };
  });
}

export function createKanbanCard(
  email: string,
  column: string,
  title: string,
): Promise<{ card: FlowKanbanCard }> {
  return native(async () => {
    const body = z
      .object({ column: z.string().min(1).max(100), title: z.string().trim().min(1).max(200) })
      .parse({ column, title });
    const user = await requireHod(email);
    await requireValidColumn(user.id, body.column);

    const top = await prisma.hodKanbanCard.findFirst({
      where: { ownerId: user.id, column: body.column },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const card = await prisma.hodKanbanCard.create({
      data: {
        ownerId: user.id,
        column: body.column,
        title: body.title,
        order: (top?.order ?? 0) + 1,
      },
    });
    return { card: card as unknown as FlowKanbanCard };
  });
}

export function moveKanbanCard(
  email: string,
  cardId: string,
  column: string,
  order: number,
): Promise<{ card: FlowKanbanCard }> {
  return native(async () => {
    const body = z
      .object({ column: z.string().min(1).max(100), order: z.number() })
      .parse({ column, order });
    const { user } = await requireOwnedCard(email, cardId);
    await requireValidColumn(user.id, body.column);

    const card = await prisma.hodKanbanCard.update({
      where: { id: cardId },
      data: { column: body.column, order: body.order },
    });
    return { card: card as unknown as FlowKanbanCard };
  });
}

export function deleteKanbanCard(email: string, cardId: string): Promise<{ deleted: true }> {
  return native(async () => {
    await requireOwnedCard(email, cardId);
    await prisma.hodKanbanCard.delete({ where: { id: cardId } });
    return { deleted: true as const };
  });
}

export function createKanbanColumn(
  email: string,
  label: string,
): Promise<{ column: FlowKanbanColumnDef }> {
  return native(async () => {
    const body = z.object({ label: z.string().trim().min(1).max(60) }).parse({ label });
    const user = await requireHod(email);

    const top = await prisma.hodKanbanColumn.findFirst({
      where: { ownerId: user.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const column = await prisma.hodKanbanColumn.create({
      data: {
        ownerId: user.id,
        label: body.label,
        order: (top?.order ?? 0) + 1,
      },
    });
    return { column: column as unknown as FlowKanbanColumnDef };
  });
}

const columnPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    order: z.number().optional(),
    color: z.enum(KANBAN_COLUMN_COLORS).nullable().optional(),
  })
  .refine((b) => b.label !== undefined || b.order !== undefined || b.color !== undefined, {
    message: "Provide label, order, and/or color",
  });

/** Shared PATCH body — rename / reorder / recolor are one route upstream. */
async function patchKanbanColumn(
  email: string,
  columnId: string,
  patch: { label?: string; order?: number; color?: FlowKanbanColumnColor | null },
): Promise<{ column: FlowKanbanColumnDef }> {
  const body = columnPatchSchema.parse(patch);
  await requireOwnedColumn(email, columnId);

  const column = await prisma.hodKanbanColumn.update({
    where: { id: columnId },
    data: {
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.order !== undefined ? { order: body.order } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
    },
  });
  return { column: column as unknown as FlowKanbanColumnDef };
}

export function renameKanbanColumn(
  email: string,
  columnId: string,
  label: string,
): Promise<{ column: FlowKanbanColumnDef }> {
  return native(() => patchKanbanColumn(email, columnId, { label }));
}

/** Drag-reorder the column itself (not its cards). */
export function moveKanbanColumn(
  email: string,
  columnId: string,
  order: number,
): Promise<{ column: FlowKanbanColumnDef }> {
  return native(() => patchKanbanColumn(email, columnId, { order }));
}

/** Column title color — a preset key, or null to reset to the neutral default. */
export function recolorKanbanColumn(
  email: string,
  columnId: string,
  color: FlowKanbanColumnColor | null,
): Promise<{ column: FlowKanbanColumnDef }> {
  return native(() => patchKanbanColumn(email, columnId, { color }));
}

export function deleteKanbanColumn(email: string, columnId: string): Promise<{ deleted: true }> {
  return native(async () => {
    await requireOwnedColumn(email, columnId);

    const cardCount = await prisma.hodKanbanCard.count({ where: { column: columnId } });
    if (cardCount > 0) {
      throw new ApiHttpError(
        400,
        `Move or remove this column's ${cardCount} card${cardCount === 1 ? "" : "s"} first`,
      );
    }

    await prisma.hodKanbanColumn.delete({ where: { id: columnId } });
    return { deleted: true as const };
  });
}
```

- [ ] **Step 2: Write the barrel** — `src/task-manager/data.ts` (complete file):

```ts
// Barrel for the Task Manager data layer — pages import everything from
// "@/task-manager/data", mirroring how the old osc-demo pages imported
// everything from "@/osc/flow-client".
export { FlowBridgeError, NoAccountError, SetupPendingError } from "./data/core";
export * from "./data/queries";
export * from "./data/ceo";
export * from "./data/tasks";
export * from "./data/manpower";
export * from "./data/kanban";
```

- [ ] **Step 3: Typecheck gate**

Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines.

- [ ] **Step 4: Commit**

```bash
git add src/task-manager/data/kanban.ts src/task-manager/data.ts
git commit -m "feat(task-manager): data-layer HOD kanban + barrel"
```

---

### Task 14: The main page — `/task-manager`

**Files:**
- Create: `src/app/task-manager/page.tsx`

This is the `osc-demo/clickup-tasks/page.tsx` wiring with three substitutions: `await auth()` supplies the email (no `?email=`/DemoUserSwitcher), OSC's `AppShell` replaces the demo canvas, and errors map to the three status cards.

- [ ] **Step 1: Write page.tsx** (complete file):

```tsx
// /task-manager — the role-scoped Task Manager view (replaces the old
// ClickUp Tasks feature). Wiring mirrors Flow's osc-demo/clickup-tasks page:
// this server component fetches all payloads, defines the server actions
// (each closing over the session email), and passes both down as props — the
// client components never fetch and never see an identity primitive.
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import AppShell from "@/app/components/AppShell";
import {
  assignFlowTask,
  completeFlowTask,
  createKanbanCard,
  createKanbanColumn,
  deleteKanbanCard,
  deleteKanbanColumn,
  getCeoDashboardConfig,
  getDepartmentDetail,
  getFlowDetail,
  getFlowStaff,
  getHodKanban,
  moveKanbanCard,
  moveKanbanColumn,
  recolorKanbanColumn,
  renameKanbanColumn,
  reopenFlowTask,
  saveCeoDashboardConfig,
  skipFlowTask,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { TaskManagerView } from "@/task-manager/ui/task-manager-view";
import { FLOW_DEPARTMENTS, type FlowAssignInput, type FlowKanbanColumnColor } from "@/task-manager/ui/types";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";

export const dynamic = "force-dynamic";

export default async function TaskManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  const sp = await searchParams;
  const period = sp.period === "monthly" ? "monthly" : "daily";
  const href = (p: string) => `/task-manager?period=${p}`;

  async function assign(input: FlowAssignInput) {
    "use server";
    const result = await assignFlowTask(email, input);
    revalidatePath("/task-manager");
    return result;
  }

  async function completeTask(runBlockId: string) {
    "use server";
    await completeFlowTask(email, runBlockId);
    revalidatePath("/task-manager");
  }

  async function skipTask(runBlockId: string) {
    "use server";
    await skipFlowTask(email, runBlockId);
    revalidatePath("/task-manager");
  }

  async function reopenTask(runBlockId: string) {
    "use server";
    await reopenFlowTask(email, runBlockId);
    revalidatePath("/task-manager");
  }

  // CEO pinned-department boards: Daily and Monthly are fully independent —
  // each cadence gets its own actions, closed over a fixed cadence.
  function makeCeoActions(cadence: "daily" | "monthly") {
    async function add(department: string) {
      "use server";
      const { departments } = await getCeoDashboardConfig(email, cadence);
      if (!departments.includes(department)) {
        await saveCeoDashboardConfig(email, cadence, [...departments, department]);
      }
      revalidatePath("/task-manager");
    }
    async function remove(department: string) {
      "use server";
      const { departments } = await getCeoDashboardConfig(email, cadence);
      await saveCeoDashboardConfig(email, cadence, departments.filter((d) => d !== department));
      revalidatePath("/task-manager");
    }
    async function reorder(orderedNames: string[]) {
      "use server";
      await saveCeoDashboardConfig(email, cadence, orderedNames);
      revalidatePath("/task-manager");
    }
    return { add, remove, reorder };
  }
  const ceoDailyActions = makeCeoActions("daily");
  const ceoMonthlyActions = makeCeoActions("monthly");

  const hodKanbanActions = {
    async create(column: string, title: string) {
      "use server";
      await createKanbanCard(email, column, title);
      revalidatePath("/task-manager");
    },
    async move(cardId: string, column: string, order: number) {
      "use server";
      await moveKanbanCard(email, cardId, column, order);
      revalidatePath("/task-manager");
    },
    async remove(cardId: string) {
      "use server";
      await deleteKanbanCard(email, cardId);
      revalidatePath("/task-manager");
    },
    async createColumn(label: string) {
      "use server";
      await createKanbanColumn(email, label);
      revalidatePath("/task-manager");
    },
    async renameColumn(columnId: string, label: string) {
      "use server";
      await renameKanbanColumn(email, columnId, label);
      revalidatePath("/task-manager");
    },
    async moveColumn(columnId: string, order: number) {
      "use server";
      await moveKanbanColumn(email, columnId, order);
      revalidatePath("/task-manager");
    },
    async recolorColumn(columnId: string, color: FlowKanbanColumnColor | null) {
      "use server";
      await recolorKanbanColumn(email, columnId, color);
      revalidatePath("/task-manager");
    },
    async deleteColumn(columnId: string) {
      "use server";
      await deleteKanbanColumn(email, columnId);
      revalidatePath("/task-manager");
    },
  };

  let body: ReactNode;
  try {
    const [daily, monthly, { staff }] = await Promise.all([
      getFlowDetail(email, "daily"),
      getFlowDetail(email, "monthly"),
      getFlowStaff(),
    ]);

    // CEO only: each cadence's own pinned list + donut data, independently.
    let ceoDashboard: Parameters<typeof TaskManagerView>[0]["ceoDashboard"];
    if (daily.me.me.role === "CEO") {
      const [dailyConfig, monthlyConfig] = await Promise.all([
        getCeoDashboardConfig(email, "daily"),
        getCeoDashboardConfig(email, "monthly"),
      ]);
      const [dailyDetails, monthlyDetails] = await Promise.all([
        Promise.all(dailyConfig.departments.map((name) => getDepartmentDetail(email, name, "daily"))),
        Promise.all(monthlyConfig.departments.map((name) => getDepartmentDetail(email, name, "monthly"))),
      ]);
      ceoDashboard = {
        daily: {
          departments: dailyDetails.map((r) => r.department),
          availableToAdd: FLOW_DEPARTMENTS.filter((d) => !dailyConfig.departments.includes(d)),
          actions: ceoDailyActions,
        },
        monthly: {
          departments: monthlyDetails.map((r) => r.department),
          availableToAdd: FLOW_DEPARTMENTS.filter((d) => !monthlyConfig.departments.includes(d)),
          actions: ceoMonthlyActions,
        },
      };
    }

    // HOD only: their own board's cards + columns.
    let hodKanban: Parameters<typeof TaskManagerView>[0]["hodKanban"];
    if (daily.me.me.role === "HOD") {
      const { cards, columns } = await getHodKanban(email);
      hodKanban = { cards, columns, actions: hodKanbanActions };
    }

    body = (
      <TaskManagerView
        daily={daily}
        monthly={monthly}
        period={period}
        dailyHref={href("daily")}
        monthlyHref={href("monthly")}
        assignAction={assign}
        completeTaskAction={completeTask}
        skipTaskAction={skipTask}
        reopenTaskAction={reopenTask}
        manpowerScheduleHref="/task-manager/manpower-schedule"
        departmentOverviewHref="/task-manager/department-overview"
        ceoDashboard={ceoDashboard}
        staff={staff}
        hodKanban={hodKanban}
      />
    );
  } catch (err) {
    if (err instanceof SetupPendingError) {
      body = <SetupPendingCard />;
    } else if (err instanceof NoAccountError) {
      body = <NoAccountCard email={email} />;
    } else {
      body = (
        <TaskManagerErrorCard
          message={err instanceof FlowBridgeError ? err.message : "Unexpected error"}
        />
      );
    }
  }

  return (
    <AppShell email={email} role={su.role} name={su.name}>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Task Manager</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your tasks, team status, and assignments — daily and monthly.
          </p>
        </div>
        {body}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Typecheck gate**

Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines. (If `TaskManagerView`'s prop names differ from the demo's — they shouldn't, the component is a verbatim port — the source of truth is `src/task-manager/ui/task-manager-view.tsx`.)

- [ ] **Step 3: Smoke-check the route compiles in dev**

Run: `npm run dev` (background), then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/task-manager`
Expected: `307` (redirect to /login — no session under curl). Stop the dev server afterwards. With `TASK_MANAGER_DATABASE_URL` unset, a logged-in browser visit shows the SetupPendingCard — full functional verification happens in Task 18 once the dev DB is seeded.

- [ ] **Step 4: Commit**

```bash
git add src/app/task-manager/page.tsx
git commit -m "feat(task-manager): /task-manager page (auth, actions, role-scoped view)"
```

---

### Task 15: Sub-pages — department overview + manpower schedule

**Files:**
- Create: `src/app/task-manager/department-overview/page.tsx`
- Create: `src/app/task-manager/manpower-schedule/page.tsx`

Same substitution pattern as Task 14, applied to the other two demo pages.

- [ ] **Step 1: Write department-overview/page.tsx** (complete file):

```tsx
// /task-manager/department-overview — chips + donut + click-through member
// roster, Daily and Monthly side by side. Org roles (ADMIN/CEO/OPS) pick any
// official department; HOD is locked to their own.
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AppShell from "@/app/components/AppShell";
import {
  getDepartmentDetail,
  getFlowDetail,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { DepartmentOverviewSection } from "@/task-manager/ui/department-overview";
import { FLOW_DEPARTMENTS } from "@/task-manager/ui/types";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";

export const dynamic = "force-dynamic";

function DepartmentPicker({
  current,
  hrefFor,
}: {
  current: string;
  hrefFor: (department: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FLOW_DEPARTMENTS.map((d) => (
        <a
          key={d}
          href={hrefFor(d)}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
            d === current
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {d}
        </a>
      ))}
    </div>
  );
}

export default async function DepartmentOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  const sp = await searchParams;
  const hrefFor = (department: string) =>
    `/task-manager/department-overview?department=${encodeURIComponent(department)}`;

  let body: ReactNode;
  let isOrgRole = false;
  let department = "";
  try {
    // Fetched first just to learn the viewer's role/own-department.
    const identity = await getFlowDetail(email, "daily");
    isOrgRole =
      identity.me.me.role === "ADMIN" ||
      identity.me.me.role === "CEO" ||
      identity.me.me.role === "OPS";

    const requested =
      sp.department && (FLOW_DEPARTMENTS as readonly string[]).includes(sp.department)
        ? sp.department
        : null;
    department =
      requested ??
      (isOrgRole ? FLOW_DEPARTMENTS[0] : (identity.me.me.department ?? FLOW_DEPARTMENTS[0]));

    const [daily, monthly] = await Promise.all([
      getDepartmentDetail(email, department, "daily"),
      getDepartmentDetail(email, department, "monthly"),
    ]);

    body = (
      <div className="flex flex-col gap-8">
        <DepartmentOverviewSection label="Daily" department={daily.department} />
        <DepartmentOverviewSection label="Monthly" department={monthly.department} />
      </div>
    );
  } catch (err) {
    if (err instanceof SetupPendingError) {
      body = <SetupPendingCard />;
    } else if (err instanceof NoAccountError) {
      body = <NoAccountCard email={email} />;
    } else {
      body = (
        <TaskManagerErrorCard
          message={err instanceof FlowBridgeError ? err.message : "Unexpected error"}
        />
      );
    }
  }

  return (
    <AppShell email={email} role={su.role} name={su.name}>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Department Overview</h1>
            <p className="mt-1 text-sm text-gray-500">
              Daily and Monthly department status, with a click-through member roster.
            </p>
          </div>
          <Link
            href="/task-manager"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            ← Task Manager
          </Link>
        </div>
        {isOrgRole && department && <DepartmentPicker current={department} hrefFor={hrefFor} />}
        {body}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Write manpower-schedule/page.tsx** (complete file):

```tsx
// /task-manager/manpower-schedule — the branch staffing grid: editable for
// the branch manager who owns the branch, read-only for anyone else on it.
// Cell assignments sync to each coach's task list on publish.
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import AppShell from "@/app/components/AppShell";
import {
  addScheduleColumn,
  addScheduleRow,
  assignScheduleCell,
  createManpowerSchedule,
  deleteScheduleColumn,
  deleteScheduleRow,
  getFlowStaff,
  getManpowerSchedule,
  publishSchedule,
  renameScheduleRow,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { ManpowerScheduleGrid } from "@/task-manager/ui/manpower-schedule-grid";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";

export const dynamic = "force-dynamic";

function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

export default async function ManpowerSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayLocal();
  const hrefFor = (d: string) => `/task-manager/manpower-schedule?date=${d}`;

  async function createSchedule() {
    "use server";
    await createManpowerSchedule(email, date);
    revalidatePath("/task-manager/manpower-schedule");
  }
  async function addRow(startTime: string, endTime: string) {
    "use server";
    const { schedule } = await getManpowerSchedule(email, date);
    if (!schedule) return;
    await addScheduleRow(email, schedule.id, startTime, endTime);
    revalidatePath("/task-manager/manpower-schedule");
  }
  async function renameRow(oldStart: string, oldEnd: string, newStart: string, newEnd: string) {
    "use server";
    const { schedule } = await getManpowerSchedule(email, date);
    if (!schedule) return;
    await renameScheduleRow(email, schedule.id, oldStart, oldEnd, newStart, newEnd);
    revalidatePath("/task-manager/manpower-schedule");
  }
  async function deleteRow(startTime: string, endTime: string) {
    "use server";
    const { schedule } = await getManpowerSchedule(email, date);
    if (!schedule) return;
    await deleteScheduleRow(email, schedule.id, startTime, endTime);
    revalidatePath("/task-manager/manpower-schedule");
  }
  async function addColumn(kind: "Coach" | "Exec") {
    "use server";
    const { schedule } = await getManpowerSchedule(email, date);
    if (!schedule) return;
    await addScheduleColumn(email, schedule.id, kind);
    revalidatePath("/task-manager/manpower-schedule");
  }
  async function deleteColumn(roleColumn: string) {
    "use server";
    const { schedule } = await getManpowerSchedule(email, date);
    if (!schedule) return;
    await deleteScheduleColumn(email, schedule.id, roleColumn);
    revalidatePath("/task-manager/manpower-schedule");
  }
  async function assignCell(slotId: string, assignedStaffId: string | null) {
    "use server";
    await assignScheduleCell(email, slotId, assignedStaffId);
    revalidatePath("/task-manager/manpower-schedule");
  }
  async function publish() {
    "use server";
    const { schedule } = await getManpowerSchedule(email, date);
    if (!schedule) return;
    await publishSchedule(email, schedule.id);
    revalidatePath("/task-manager/manpower-schedule");
  }

  let body: ReactNode;
  try {
    const [{ schedule, canEdit }, { staff }] = await Promise.all([
      getManpowerSchedule(email, date),
      getFlowStaff(),
    ]);
    const branchStaff = schedule ? staff.filter((s) => s.branch === schedule.branch) : staff;

    body = (
      <ManpowerScheduleGrid
        schedule={schedule}
        canEdit={canEdit}
        staff={branchStaff}
        actions={{
          createSchedule,
          addRow,
          renameRow,
          deleteRow,
          addColumn,
          deleteColumn,
          assignCell,
          publish,
        }}
      />
    );
  } catch (err) {
    if (err instanceof SetupPendingError) {
      body = <SetupPendingCard />;
    } else if (err instanceof NoAccountError) {
      body = <NoAccountCard email={email} />;
    } else {
      body = (
        <TaskManagerErrorCard
          message={err instanceof FlowBridgeError ? err.message : "Unexpected error"}
        />
      );
    }
  }

  return (
    <AppShell email={email} role={su.role} name={su.name}>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Manpower Schedule</h1>
            <p className="mt-1 text-sm text-gray-500">
              Plan the day&apos;s staffing grid — assignments sync to each coach&apos;s task list on publish.
            </p>
          </div>
          <Link
            href="/task-manager"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            ← Task Manager
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <a href={hrefFor(shiftDate(date, -1))} className="font-medium text-blue-600 hover:text-blue-700">
            ← Prev day
          </a>
          <span className="font-semibold text-gray-700">{date}</span>
          <a href={hrefFor(shiftDate(date, 1))} className="font-medium text-blue-600 hover:text-blue-700">
            Next day →
          </a>
        </div>
        {body}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Typecheck gate**

Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines.

- [ ] **Step 4: Commit**

```bash
git add src/app/task-manager/department-overview src/app/task-manager/manpower-schedule
git commit -m "feat(task-manager): department-overview + manpower-schedule pages"
```

---

### Task 16: Remove the old ClickUp feature + repoint the entry points

**Files:**
- Delete: `src/app/clickup-dashboard/` (whole dir), `src/app/tasks/page.tsx`, `src/app/api/clickup/` (whole dir), `src/lib/clickup.ts`, `src/lib/clickup-access.ts`, `src/lib/clickup-queries.ts`, `src/lib/clickup.test.ts`, `src/lib/clickup-access.test.ts`, `src/app/components/ClickUpTaskListModal.tsx`
- Modify: `src/app/components/Sidebar.tsx:138`, `src/app/components/DashboardHome.tsx:91-100,129`, `src/app/components/BranchDashboard.tsx:437`
- Do NOT touch: `src/app/components/StatusDonut.tsx`, `src/app/components/LeaveRequestsView.tsx`, `src/lib/induction-task-spec.ts`, `src/app/induction/templates.ts`, `src/app/components/CrmTicketPlatformsPage.tsx`, `src/app/components/CrmTicketNewPage.tsx`

- [ ] **Step 1: Delete the feature files**

```bash
git rm -r src/app/clickup-dashboard src/app/api/clickup
git rm src/app/tasks/page.tsx
git rm src/lib/clickup.ts src/lib/clickup-access.ts src/lib/clickup-queries.ts
git rm src/lib/clickup.test.ts src/lib/clickup-access.test.ts
git rm src/app/components/ClickUpTaskListModal.tsx
```

(If `src/app/tasks/` is then empty, remove the empty dir too: `rmdir src/app/tasks` — git ignores empty dirs but the working tree shouldn't keep one.)

- [ ] **Step 2: Repoint the sidebar entry**

In `src/app/components/Sidebar.tsx` line 138:

Old: `  { name: "ClickUp Tasks", href: "/clickup-dashboard", Icon: ListChecks },`
New: `  { name: "Task Manager", href: "/task-manager", Icon: ListChecks },`

- [ ] **Step 3: Repoint the homepage tile**

In `src/app/components/DashboardHome.tsx`, replace the tile object (lines 91–100):

Old:

```tsx
  {
    id: "clickup",
    title: "ClickUp Tasks",
    icon: "✅",
    color: "bg-teal-500",
    items: [
      { name: "Branch Dashboards", href: "/clickup-dashboard", icon: "🏢" },
      { name: "Operations by Day", href: "/clickup-dashboard/operations", icon: "📅" },
    ],
  },
```

New:

```tsx
  {
    id: "task-manager",
    title: "Task Manager",
    icon: "✅",
    color: "bg-teal-500",
    items: [
      { name: "My Tasks", href: "/task-manager", icon: "📋" },
      { name: "Manpower Schedule", href: "/task-manager/manpower-schedule", icon: "📅" },
    ],
  },
```

AND update the href ternary on line 129 (it special-cases tile ids — miss this and the tile links to a dead `/dashboards/task-manager`):

Old: `... : dashboard.id === "clickup" ? "/clickup-dashboard" : ...`
New: `... : dashboard.id === "task-manager" ? "/task-manager" : ...`

- [ ] **Step 4: Relabel the mock donut on BranchDashboard**

In `src/app/components/BranchDashboard.tsx` line 437:

Old: `          <Panel title="Monthly ClickUp" icon={<i className="ti ti-chart-pie" />}>`
New: `          <Panel title="Monthly Tasks" icon={<i className="ti ti-chart-pie" />}>`

(The `CLICKUP` const it renders is local hardcoded mock data — leave the identifier and data alone; only the visible title changes. The comment on line 436 may be updated to match or left.)

- [ ] **Step 5: Regression sweep**

```bash
grep -rn "clickup\|ClickUp" src/ --include="*.ts" --include="*.tsx" -l
```

Expected — ONLY these files may appear, for these known reasons:
- `src/app/components/BranchDashboard.tsx` (local mock `CLICKUP` const + comments)
- `src/app/components/CrmTicketPlatformsPage.tsx`, `src/app/components/CrmTicketNewPage.tsx` (mock ticket-source platform names — unrelated CRM feature)
- `src/lib/induction-task-spec.ts`, `src/app/induction/templates.ts` (onboarding training text about the real ClickUp app)
- `src/task-manager/ui/*` (code comments only — verified in Task 8)

Any OTHER file appearing is a missed reference — fix it before proceeding. Then:

```bash
grep -rn "@/lib/clickup\|/clickup-dashboard\|href=\"/tasks\"" src/
```

Expected: no output.

- [ ] **Step 6: Tests + build**

Run: `npm test`
Expected: PASS (the two deleted clickup test files are gone; everything else green).
Run: `npm run build`
Expected: build completes; no module-resolution errors from the deletions.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(task-manager)!: remove ClickUp Tasks feature, repoint nav to Task Manager"
```

---

### Task 17: Dockerfile + CI + deploy.yml env cleanup

**Files:**
- Modify: `Dockerfile`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Dockerfile — generate the second client**

The build must copy the second Prisma config before generating. Old (lines 12–14):

```dockerfile
# Generate Prisma client against the Linux target (host generates against Windows)
COPY prisma ./prisma/
RUN npx prisma generate
```

New:

```dockerfile
# Generate Prisma clients against the Linux target (host generates against Windows)
COPY prisma ./prisma/
COPY prisma.task-manager.config.ts ./
RUN npx prisma generate
RUN npx prisma generate --config prisma.task-manager.config.ts
```

(The `COPY prisma ./prisma/` line already brings `prisma/task-manager/**` along — only the root-level config file needs its own COPY.)

> **Note (added after this plan was written, per review):** the container also needs `TZ=Asia/Kuala_Lumpur` plus `apk add tzdata`, because the task engine's day-boundary/dueAt math runs on process-local time and the business is MYT — and `node:20-alpine` ships no zoneinfo database, so a bare `TZ` env silently no-ops without `tzdata`. `src/lib/myt.ts` was verified fixed-offset/UTC (TZ-independent) first, so this can't regress the existing OSC attendance/scanner features built on it.

- [ ] **Step 2: CI validate job — generate the second client**

In `.github/workflows/deploy.yml`, after the existing "Generate Prisma client" step (lines 28–29), add:

```yaml
      - name: Generate Task Manager Prisma client
        run: npx prisma generate --config prisma.task-manager.config.ts
```

- [ ] **Step 3: deploy.yml — delete the ClickUp env injection**

In the SSH script block, find the section that starts with the comment `# Ensure remote .env has ClickUp configuration` (currently lines 82–88). Delete that ENTIRE section — the comment line, the two `sed -i '/^CLICKUP_.../d'` lines, and the two `printf` lines that append `CLICKUP_API_TOKEN` / `CLICKUP_TEAM_ID` — but KEEP the `touch .env` line by moving it to the top of the Google Drive section that follows. The result must read:

```
            # Ensure remote .env has Google Drive configuration
            touch .env
            sed -i '/^GOOGLE_DRIVE_SA_EMAIL=/d' .env || true
```

…with the rest of the Google Drive block unchanged below it. Do NOT touch the Google Drive lines themselves — they belong to the separate secret-rotation effort.

- [ ] **Step 4: Verify the workflow is still valid YAML**

Run: `npx --yes yaml-lint .github/workflows/deploy.yml 2>/dev/null || node -e "const y=require('js-yaml');y.load(require('fs').readFileSync('.github/workflows/deploy.yml','utf8'));console.log('yaml ok')"`
If neither linter is available, minimum bar: `grep -n "CLICKUP" .github/workflows/deploy.yml` → expected: no output, and visually confirm the script block indentation matches the surrounding lines (12 spaces).

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .github/workflows/deploy.yml
git commit -m "chore(task-manager): build second prisma client in Docker/CI, drop ClickUp env injection"
```

---

### Task 18: Dev database — migrate, seed, and the manual role-matrix verification

**Files:**
- Modify: `prisma/task-manager/seed.ts` (import rewiring only)
- Modify: `.env` (dev machine only — never committed)

- [ ] **Step 1: Copy the seed and rewire its imports**

```bash
cp /d/ebright-flow/prisma/seed.ts prisma/task-manager/seed.ts
```

Open `prisma/task-manager/seed.ts` and make exactly these header changes (the other ~2,450 lines stay untouched):

Old (lines 8–19):

```ts
import {
  PrismaClient,
  Prisma,
  type BlockStatus,
  type ItemType,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { buildTemplateSnapshot } from "../server/engine/snapshot";
import { BRANCH_STAFF_ROLES, DEPARTMENT_EMPLOYMENT_TYPES } from "../src/app/api/analytics/_lib";
import type { ConditionalEdge, RunItemValue } from "../src/lib/types";

const prisma = new PrismaClient();
```

New:

```ts
import {
  Prisma,
  type BlockStatus,
  type ItemType,
} from "../../src/generated/task-manager-client";
import { randomUUID } from "node:crypto";
import { buildTemplateSnapshot } from "../../src/task-manager/engine/snapshot";
import { BRANCH_STAFF_ROLES, DEPARTMENT_EMPLOYMENT_TYPES } from "../../src/task-manager/analytics/_lib";
import type { ConditionalEdge, RunItemValue } from "../../src/task-manager/lib/types";
import { prisma } from "../../src/task-manager/prisma";
```

(Careful with the types import: it must point at the PORTED `src/task-manager/lib/types` — `src/lib/` is OSC's own unrelated lib.) Reusing the app singleton (`src/task-manager/prisma.ts`) instead of constructing a client means the seed automatically targets `TASK_MANAGER_DATABASE_URL` with the adapter — no separate construction needed. Then check for any OTHER imports further down the file: `grep -n "^import\|from \"\.\./" prisma/task-manager/seed.ts | head -30` and rewire any stragglers per the map.

- [ ] **Step 2: Create the dev database**

Add to your dev `.env` (same Postgres server as your `DATABASE_URL`, new database name):

```
TASK_MANAGER_DATABASE_URL="postgresql://<same-user>:<same-password>@<same-host>:<same-port>/ebright_task_manager"
```

Create the database (any SQL client works; with psql — paste your `DATABASE_URL` value literally, the shell does NOT auto-load `.env`):

```bash
psql "<paste the DATABASE_URL value from .env>" -c 'CREATE DATABASE ebright_task_manager;'
```

Expected: `CREATE DATABASE`. (No psql on Windows? Run the same statement from DBeaver/pgAdmin connected to the dev server.)

- [ ] **Step 3: Migrate + seed**

Run: `npm run tm:migrate`
Expected: "18 migrations found … All migrations have been successfully applied."
Run: `npm run tm:seed`
Expected: seed completes and prints its summary (creates ~90 demo users, workspaces, flows — including the 5 utility flows — and runs). Re-running is safe in dev (it wipes this database only — it connects exclusively through `TASK_MANAGER_DATABASE_URL`).

- [ ] **Step 4: Line up a login for each role**

The seeded demo users use `@ebright.my` emails (see `DEMO_USERS` in `D:\ebright-flow\src\app\osc-demo\demo-bits.tsx` for the full role → email map, e.g. `superadmin@ebright.my`, `elaine@ebright.my` (CEO), `nurul@ebright.my` (OPS), `farid@ebright.my` (BRANCH), `daniel@ebright.my` (HOD), `sarah@ebright.my` (staff)). OSC logins live in OSC's own `users` table — for each role you want to verify, either create an OSC account with that exact email (via the account-management page as superadmin), or edit that one user's `email:` in `prisma/task-manager/seed.ts` to match an existing OSC dev login and re-run `npm run tm:seed`. Matching is case-insensitive.

- [ ] **Step 5: Manual role-matrix verification (dev server running: `npm run dev`)**

Work through this checklist in the browser; each line states the expected observation:

1. Sidebar shows **Task Manager** (no "ClickUp Tasks"); homepage tile shows **Task Manager** with My Tasks + Manpower Schedule links.
2. **Staff (MEMBER)** login → `/task-manager`: personal Daily/Monthly cards only; complete a task via the status dot → it moves to Completed; set N/A via dropdown → Skipped; reopen → Pending again.
3. **HOD** login: department roster + buckets visible; member drill-down opens; "My Board" kanban renders — create a card, drag it between columns, add/rename/recolor a column, delete an empty column.
4. **BRANCH** login: branch roster + ad hoc section; `/task-manager/manpower-schedule` → create today's schedule, add a row + a Coach column, assign a coach to a cell, publish → cell shows the synced badge, and that coach's login now sees the shift task in their list. Then reassign that synced cell to a different coach — the old coach's task disappears (its run is CANCELLED, audit-logged) and exactly one new task appears for the new coach; finally unassign the cell entirely — the new coach's task disappears too.
5. **CEO** login: Daily and Monthly pinned-department boards render independently; add/remove/reorder departments (drag) persists per cadence.
6. **ADMIN (superadmin)** and **OPS** logins: org-wide branch/department rollups + Ad hoc by Region; OPS additionally sees its own department card. "+ Task" assign with a due date lands on the recipients' lists with the right cadence tag.
7. `/task-manager/department-overview`: org role can switch departments via chips; HOD is locked to their own (chips hidden).
8. An OSC login whose email is NOT in the seed → `/task-manager` shows the **No Task Manager account yet** card (not an error).
9. Temporarily comment out `TASK_MANAGER_DATABASE_URL` in `.env`, restart dev → **Task Manager is being set up** card; restore the var afterwards.
10. Old routes are gone: `/clickup-dashboard`, `/tasks`, `/api/clickup/tasks` all 404.
11. The Leave Requests view still renders its donut (StatusDonut intact).

If any line fails, STOP and fix before proceeding — note the failure against the relevant earlier task.

- [ ] **Step 6: Commit the seed**

```bash
git add prisma/task-manager/seed.ts
git commit -m "feat(task-manager): dev seed wired to the task-manager client"
```

---

### Task 19: Roster parser (TDD) + bootstrap script + roster template

> **REDESIGNED (2026-07-24):** the hand-maintained `roster.csv` design below
> was replaced at the user's direction — real staff already live in the
> `ebright_hrfs` database's `User` table, on the same Postgres server as
> `TASK_MANAGER_DATABASE_URL`. The bootstrap now imports ACTIVE HRFS users
> through a checked-in mapping config instead: see `prisma/task-manager/
> hrfs-map.ts` (+ `hrfs-map.test.ts`) and the rewritten `bootstrap.ts`. No
> `roster.csv`/`roster-parse.ts` exist; Step 6's utility-flow provisioning is
> unchanged. Text below is kept as historical record, not a to-do list.

**Files:**
- Create: `prisma/task-manager/roster-parse.test.ts` (FIRST — TDD)
- Create: `prisma/task-manager/roster-parse.ts`
- Create: `prisma/task-manager/bootstrap.ts`
- Create: `prisma/task-manager/roster.csv`
- Modify: `vitest.config.ts` (include the new test location)

- [ ] **Step 1: Let vitest see tests under prisma/task-manager**

In `vitest.config.ts`, change the include line:

Old: `    include: ["src/**/*.test.ts"],`
New: `    include: ["src/**/*.test.ts", "prisma/task-manager/**/*.test.ts"],`

- [ ] **Step 2: Write the failing test** — `prisma/task-manager/roster-parse.test.ts` (complete file):

```ts
import { describe, expect, it } from "vitest";
import { ALL_BRANCHES, ROSTER_HEADER, parseRosterCsv } from "./roster-parse";
import { FLOW_DEPARTMENTS } from "../../src/task-manager/ui/types";

const branch = ALL_BRANCHES[0];
const dept = FLOW_DEPARTMENTS[0];

function csv(...rows: string[]): string {
  return [ROSTER_HEADER, ...rows].join("\n");
}

describe("parseRosterCsv", () => {
  it("parses valid rows and lowercases emails", () => {
    const rows = parseRosterCsv(
      csv(
        `Admin@Ebright.my,Admin One,ADMIN,,,,`,
        `manager@ebright.my,Farid,BRANCH,,${branch},Manager,`,
        `hod@ebright.my,Daniel,HOD,${dept},,HOD,`,
      ),
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].email).toBe("admin@ebright.my");
    expect(rows[0].department).toBeNull();
    expect(rows[1].branch).toBe(branch);
    expect(rows[2].department).toBe(dept);
  });

  it("tolerates blank lines and CRLF", () => {
    const rows = parseRosterCsv(`${ROSTER_HEADER}\r\n\r\nstaff@ebright.my,Sarah,MEMBER,${dept},,Intern,\r\n`);
    expect(rows).toHaveLength(1);
  });

  it("rejects a wrong header", () => {
    expect(() => parseRosterCsv("email,name\nx@y.my,X")).toThrow(/first line/);
  });

  it("rejects an unknown role, with the line number", () => {
    expect(() => parseRosterCsv(csv("x@ebright.my,X,WIZARD,,,,"))).toThrow(/line 2/);
  });

  it("rejects an unknown branch", () => {
    expect(() => parseRosterCsv(csv(`x@ebright.my,X,BRANCH,,Atlantis,Manager,`))).toThrow(/branch/i);
  });

  it("rejects a wrong field count", () => {
    expect(() => parseRosterCsv(csv("x@ebright.my,X,MEMBER"))).toThrow(/7 fields/);
  });

  it("rejects duplicate emails", () => {
    expect(() =>
      parseRosterCsv(csv("x@ebright.my,X,MEMBER,,,,", "X@ebright.my,X2,MEMBER,,,,")),
    ).toThrow(/duplicate/i);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run prisma/task-manager/roster-parse.test.ts`
Expected: FAIL — cannot resolve `./roster-parse`.

- [ ] **Step 4: Write the implementation** — `prisma/task-manager/roster-parse.ts` (complete file):

```ts
// Pure roster.csv parser/validator for bootstrap.ts. No DB, no side effects —
// unit-tested in roster-parse.test.ts. Naive CSV: comma-split, NO quoted-field
// support (names must not contain commas), empty cell = null.
import { z } from "zod";
import { FLOW_BRANCH_REGIONS, FLOW_DEPARTMENTS } from "../../src/task-manager/ui/types";

export const ROSTER_HEADER = "email,name,role,department,branch,employmentType,coachSchedule";

// Keep in sync with the Role enum in prisma/task-manager/schema.prisma.
const ROLES = ["ADMIN", "CEO", "OPS", "BRANCH", "HOD", "MEMBER", "DEPT_SITE", "BRANCH_SITE"] as const;

// FLOW_BRANCH_REGIONS is the UI package's region → branches reference data;
// flatten it whichever shape it has (record-of-arrays or array-of-groups).
export const ALL_BRANCHES: readonly string[] = Array.isArray(FLOW_BRANCH_REGIONS)
  ? (FLOW_BRANCH_REGIONS as ReadonlyArray<{ branches: readonly string[] }>).flatMap(
      (r) => r.branches,
    )
  : Object.values(FLOW_BRANCH_REGIONS as Record<string, readonly string[]>).flat();

const rowSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(120),
  role: z.enum(ROLES),
  department: z
    .enum(FLOW_DEPARTMENTS as unknown as [string, ...string[]])
    .nullable(),
  branch: z
    .string()
    .nullable()
    .refine((b) => b === null || ALL_BRANCHES.includes(b), { message: "unknown branch" }),
  employmentType: z.string().min(1).max(60).nullable(),
  coachSchedule: z.string().min(1).max(60).nullable(),
});

export type RosterRow = z.infer<typeof rowSchema>;

export function parseRosterCsv(text: string): RosterRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l, i) => ({ line: l.trim(), no: i + 1 }))
    .filter(({ line }) => line.length > 0);
  if (lines.length === 0 || lines[0].line !== ROSTER_HEADER) {
    throw new Error(`roster.csv: first line must be exactly "${ROSTER_HEADER}"`);
  }

  const errors: string[] = [];
  const rows: RosterRow[] = [];
  const seen = new Set<string>();

  for (const { line, no } of lines.slice(1)) {
    const cells = line.split(",").map((c) => c.trim());
    if (cells.length !== 7) {
      errors.push(`line ${no}: expected 7 fields, got ${cells.length}`);
      continue;
    }
    const [email, name, role, department, branch, employmentType, coachSchedule] = cells;
    const candidate = {
      email: email.toLowerCase(),
      name,
      role,
      department: department === "" ? null : department,
      branch: branch === "" ? null : branch,
      employmentType: employmentType === "" ? null : employmentType,
      coachSchedule: coachSchedule === "" ? null : coachSchedule,
    };
    const parsed = rowSchema.safeParse(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      errors.push(`line ${no}: ${first?.path?.join(".") || "row"}: ${first?.message || "invalid"}`);
      continue;
    }
    if (seen.has(parsed.data.email)) {
      errors.push(`line ${no}: duplicate email ${parsed.data.email}`);
      continue;
    }
    seen.add(parsed.data.email);
    rows.push(parsed.data);
  }

  if (errors.length > 0) {
    throw new Error(`roster.csv is invalid:\n  ${errors.join("\n  ")}`);
  }
  return rows;
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npx vitest run prisma/task-manager/roster-parse.test.ts`
Expected: PASS (7 tests). If the `ALL_BRANCHES` flattening produced an empty array, open `src/task-manager/ui/types.ts`, check `FLOW_BRANCH_REGIONS`'s actual shape, and fix the flatten expression (the test's `branch` fixture would be `undefined` — that's your signal).

- [ ] **Step 6: Write bootstrap.ts** (complete file):

```ts
// Idempotent production provisioning for Task Manager. Upserts:
//   1) staff Users from roster.csv (email = the OSC login email, lowercased)
//   2) the ws-operations workspace
//   3) the 5 quick-assign utility flows (Flow + single Block + one required
//      CHECKBOX item each) — assignFlowTask and the manpower slot-sync look
//      these up BY ID, so the ids must match the demo seed's exactly.
// Never deletes anything; safe to re-run any time (re-running after editing
// the roster IS the user-management story until an admin UI exists).
// Run: npm run tm:bootstrap   (or: tsx bootstrap.ts <path-to-roster.csv>)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "../../src/generated/task-manager-client";
import { prisma } from "../../src/task-manager/prisma";
import { parseRosterCsv } from "./roster-parse";

const UTILITY_FLOWS = [
  { flowId: "flow-adhoc",        name: "Ad hoc Tasks",        icon: "⚡",  description: "One-off tasks assigned from the '+ Assigned task' quick form.", order: 2, blockId: "block-adhoc",        nodeId: "node-adhoc",        blockTitle: "Ad hoc task",        itemId: "item-adhoc-done" },
  { flowId: "flow-ceo-assign",   name: "CEO Assigned Task",   icon: "📌", description: "Tasks assigned from the CEO's '+ Add Task' quick form.",         order: 3, blockId: "block-ceo-assign",   nodeId: "node-ceo-assign",   blockTitle: "CEO assigned task",   itemId: "item-ceo-assign-done" },
  { flowId: "flow-hod-assign",   name: "HOD Assigned Task",   icon: "📋", description: "Tasks assigned from an HOD's own 'Assign Task' form.",           order: 4, blockId: "block-hod-assign",   nodeId: "node-hod-assign",   blockTitle: "HOD assigned task",   itemId: "item-hod-assign-done" },
  { flowId: "flow-admin-assign", name: "Admin Assigned Task", icon: "🛡️", description: "Tasks assigned from Superadmin's own '+ Assigned task' form.",   order: 5, blockId: "block-admin-assign", nodeId: "node-admin-assign", blockTitle: "Admin assigned task", itemId: "item-admin-assign-done" },
  { flowId: "flow-ops-assign",   name: "Ops Assigned Task",   icon: "🗂️", description: "Tasks assigned from OPS's own '+ Assigned task' form.",          order: 6, blockId: "block-ops-assign",   nodeId: "node-ops-assign",   blockTitle: "Ops assigned task",   itemId: "item-ops-assign-done" },
] as const;

async function main() {
  const rosterPath = process.argv[2] ?? join(__dirname, "roster.csv");
  const rows = parseRosterCsv(readFileSync(rosterPath, "utf8"));

  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const data = {
      name: row.name,
      role: row.role,
      department: row.department,
      branch: row.branch,
      employmentType: row.employmentType,
      coachSchedule: row.coachSchedule,
    };
    const existing = await prisma.user.findUnique({ where: { email: row.email } });
    if (existing) {
      await prisma.user.update({ where: { email: row.email }, data });
      updated++;
    } else {
      await prisma.user.create({ data: { email: row.email, ...data } });
      created++;
    }
  }
  if (rows.length === 0) {
    console.warn("[bootstrap] roster has no rows — only utility flows will be provisioned");
  }

  // Owner/escalation target: the first ADMIN in the database. Owner ids are
  // loose string refs (no FK), so "system" is a safe fallback before any
  // admin exists; Block.escalateToUserId is nullable.
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  const ownerId = admin?.id ?? "system";

  await prisma.workspace.upsert({
    where: { id: "ws-operations" },
    create: { id: "ws-operations", name: "Operations", icon: "🛠️", ownerId, department: "Operation", order: 1 },
    update: {},
  });

  for (const f of UTILITY_FLOWS) {
    const nodes = [
      {
        id: f.nodeId,
        type: "block",
        position: { x: 260, y: 0 },
        data: { kind: "block", blockId: f.blockId, title: f.blockTitle },
      },
    ] as unknown as Prisma.InputJsonValue;
    await prisma.flow.upsert({
      where: { id: f.flowId },
      create: {
        id: f.flowId,
        workspaceId: "ws-operations",
        name: f.name,
        icon: f.icon,
        description: f.description,
        ownerId,
        department: "Operation",
        order: f.order,
        version: 1,
        isPublished: true,
        nodes,
        edges: [] as unknown as Prisma.InputJsonValue,
      },
      update: { name: f.name, isPublished: true },
    });
    await prisma.block.upsert({
      where: { id: f.blockId },
      create: {
        id: f.blockId,
        flowId: f.flowId,
        nodeId: f.nodeId,
        title: f.blockTitle,
        reminderInterval: 24,
        strikeLimit: 3,
        escalateToUserId: admin?.id ?? null,
        outgoingEdges: [] as unknown as Prisma.InputJsonValue,
      },
      update: { escalateToUserId: admin?.id ?? null },
    });
    await prisma.blockItem.upsert({
      where: { id: f.itemId },
      create: {
        id: f.itemId,
        blockId: f.blockId,
        order: 0,
        type: "CHECKBOX",
        label: "Done",
        required: true,
        config: {},
      },
      update: {},
    });
  }

  console.log(
    `[bootstrap] users: ${created} created, ${updated} updated; utility flows: ${UTILITY_FLOWS.length} ensured`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[bootstrap] FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
```

If a model/field name here disagrees with the generated client (e.g. `blockItem` vs another delegate name, or a required field this omits), the source of truth is `prisma/task-manager/schema.prisma` and the demo seed's create calls (`D:\ebright-flow\prisma\seed.ts` lines ~1107–1366) — align the upsert to those, changing nothing about ids or shapes.

- [ ] **Step 7: Create the roster template** — `prisma/task-manager/roster.csv` (exactly one line; ops appends real rows before cutover):

```csv
email,name,role,department,branch,employmentType,coachSchedule
```

Row format (documented here, not in the CSV): `department` must be one of the 6 official departments or empty; `branch` one of the 28 branches or empty; branch staff get `employmentType` Manager/Coach/Branch Exec; coaches also get `coachSchedule` Full Time/Part Time. Example row: `farid@ebright.my,Farid,BRANCH,,Subang Taipan,Manager,`

- [ ] **Step 8: Full test run + typecheck gate + a real bootstrap run against the dev DB**

Run: `npm test`
Expected: PASS (including the new roster-parse suite).
Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines.
Run: `npm run tm:bootstrap`
Expected: `[bootstrap] users: 0 created, 0 updated; utility flows: 5 ensured` (header-only roster; idempotent against the seeded dev DB — re-run it to confirm the same output twice).

- [ ] **Step 9: Commit**

```bash
git add prisma/task-manager/roster-parse.ts prisma/task-manager/roster-parse.test.ts prisma/task-manager/bootstrap.ts prisma/task-manager/roster.csv vitest.config.ts
git commit -m "feat(task-manager): roster parser (TDD) + idempotent bootstrap + roster template"
```

---

### Task 20: Final verification sweep

**Files:** none (verification only; fix-forward if anything fails).

- [ ] **Step 1: Full automated pass**

Run: `npm test`
Expected: PASS — Flow's ported suites (engine ×4, analytics, manpower-helpers, email templates, ui types) + roster-parse + OSC's pre-existing suites.
Run: `npx tsc --noEmit 2>&1 | grep -i "task-manager\|src/generated"; echo "exit: $?"`
Expected: no matching lines.
Run: `npm run build`
Expected: build completes.

- [ ] **Step 2: Residue sweeps**

```bash
grep -rn '@server/\|\.\./\.\./src/lib\|FLOW_INTERNAL' src/task-manager/ src/app/task-manager/
grep -rn "CLICKUP_API_TOKEN\|CLICKUP_TEAM_ID" . --include="*.yml" --include="*.ts" --include="*.tsx" --include="Dockerfile" --include="*.json" 2>/dev/null | grep -v node_modules | grep -v docs/
```

Expected: no output from either (the docs/ exclusion covers the spec/plan's own mentions).

- [ ] **Step 3: Confirm the working tree is clean and the history tells the story**

Run: `git status` → clean. `git log --oneline main..HEAD` → the spec commit + one commit per task.

- [ ] **Step 4: Commit (only if the sweep forced fixes)**

```bash
git add -A && git commit -m "chore(task-manager): final verification fixes"
```

---

## Phase 2 — environment cutover runbook (ops steps, not coding tasks)

Run per environment, **staging first** (`103.209.156.225`), then production (`103.209.156.174`) once staging verifies. Until an environment's cutover completes, its `/task-manager` shows the "being set up" card — expected and harmless. **Heads-up (timing is the user's call): the moment the merge deploys to an environment, the old ClickUp dashboards are gone there.**

1. **Roster first:** ops fills `prisma/task-manager/roster.csv` with real staff (emails must equal OSC login emails; case-insensitive) via a normal PR into the target branch, before cutover day.
2. **Merge + deploy:** merge `task-manager-migration` → `staging` (later `staging` → `main` per the repo's usual flow). The deploy workflow builds the image with both Prisma clients.
3. **Create the database** (SSH to the host; same Postgres server `DATABASE_URL` points at — paste the URL value from `~/Ebright_OSC_V2/.env`, the shell doesn't auto-load it):
   `psql "<DATABASE_URL value>" -c 'CREATE DATABASE ebright_task_manager;'`
4. **Set the env var** — append to `~/Ebright_OSC_V2/.env`:
   `TASK_MANAGER_DATABASE_URL="postgresql://<same-user>:<same-pass>@<same-host>:<same-port>/ebright_task_manager"`
5. **Migrate + bootstrap** (from `~/Ebright_OSC_V2`; the image has prisma + tsx + both generated clients):
   `docker compose run --rm osc npm run tm:migrate`
   `docker compose run --rm osc npm run tm:bootstrap`
6. **Recreate the app** so the new env var applies: `docker compose up -d --force-recreate`
7. **Smoke test:** a roster user logs in → `/task-manager` renders their role view; assign → complete round-trips; a non-roster login sees the "No account" card; `/clickup-dashboard` 404s.
8. **Rollback lever:** removing `TASK_MANAGER_DATABASE_URL` from `.env` + `docker compose up -d --force-recreate` turns the feature into the "being set up" card without any code change. (It does not bring ClickUp Tasks back — that requires reverting the merge.)

Adding/updating staff later = edit `roster.csv` (PR) + re-run step 5's bootstrap command. Reminders/escalations stay dormant until a future phase adds `REDIS_URL` + a worker process.







