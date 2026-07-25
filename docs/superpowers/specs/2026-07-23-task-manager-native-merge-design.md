# Task Manager Native Merge — Design

- **Date:** 2026-07-23
- **Status:** Approved (design reviewed section-by-section in brainstorming session)
- **Supersedes:** the existing "ClickUp Tasks" feature and its design doc
  (`2026-06-18-clickup-department-tasks-design.md`)

## 1. Summary

Replace OSC's existing "ClickUp Tasks" feature (which calls the real ClickUp
SaaS API) with **Ebright Flow Task Manager**, a custom staff task/workflow
system currently living as a standalone Next.js 15 app at `D:\ebright-flow`.

The integration is a **full native merge**: the Task Manager UI package,
analytics/payload library, task engine, and Prisma schema all move into this
repo. The separate flow app dissolves — no second service, no iframe, no HTTP
bridge, no shared secret. `D:\ebright-flow` becomes the archived source once
the merge is verified.

Task Manager data lives in a **separate database on the same Postgres
server** OSC already uses (`ebright_task_manager`), connected via its own
Prisma client. Work is phased: Phase 1 delivers the fully functional frontend
against a seeded dev database; Phase 2 provisions the production database and
real staff.

## 2. Decisions log

| Decision | Outcome |
|---|---|
| Old ClickUp Tasks feature | **Replaced entirely** (confirmed earlier; live feature — removal ships with the port) |
| Integration shape | **Full native merge into OSC** (chosen over iframe+proxy embed and over native-UI+separate-service) |
| Code location | Inside OSC's `src/` — the earlier "vendor into `apps/`" answer is superseded by the full-merge decision |
| Deployment | No new service; OSC's existing single-service Docker/CI ships everything — the earlier "compose + CI" answer is superseded |
| Label / route | **"Task Manager"** at **`/task-manager`** |
| Database | Separate database **`ebright_task_manager`** on the existing Postgres server; connected **after** the functional frontend is built (Phase 2 for production) |
| Old ClickUp env plumbing | `CLICKUP_API_TOKEN` / `CLICKUP_TEAM_ID` and their deploy.yml injection lines removed in this migration; **secret rotation stays a separate effort** |
| Reminders/escalations (Redis) | Deferred — code ports with a no-op guard; enabled in a later phase |

## 3. Grounding facts (verified 2026-07-23)

### Source — `D:\ebright-flow`

- Next 15.5.20, React 19.2.7, Tailwind v4 (CSS-first, no config file),
  Prisma 6.19.3, zod, @dnd-kit, date-fns, bullmq + ioredis (reminder worker),
  resend (email). No icon or chart libraries — charts are hand-rolled SVG.
- **`src/osc/*` is fully self-contained**: zero imports outside the folder,
  no providers, no fonts, no CSS-token dependency (literal Tailwind
  utilities), no client-side fetching, no secrets. Data arrives as props;
  mutations arrive as server-action props. Only `flow-client.ts`
  (server-only) performs fetches.
- **Bridge API** `src/app/api/internal/*` (~20 routes): per-route
  `x-internal-secret` check + `requireUserByEmail(email)` (lowercased,
  404 if absent). Depends on `src/app/api/analytics/{_lib,_payloads}.ts`
  (payload builders + role scoping — there are no `/api/analytics` HTTP
  routes), `src/lib/{prisma,users,api-server}.ts`, and `server/engine/*`.
- **Engine write paths** (`complete/skip/reopen/assign`, manpower publish)
  call `getReminderQueue()` (BullMQ) when blocks advance; reminders run in a
  separate worker process. Read paths are pure Postgres.
- **Prisma:** provider `postgresql`, 18 migrations
  (`0001_init` … `20260722111634_single_cadence`), destructive demo seed
  (`prisma/seed.ts`, wipes then creates ~90 users + workspaces + flows +
  runs, including the 5 quick-assign utility flows).
- **Org model:** roles `ADMIN, CEO, OPS, BRANCH, HOD, MEMBER, DEPT_SITE,
  BRANCH_SITE`; 6 fixed departments (Operation, Academy, Marketing,
  Optimisation, Human Resource, Finance); 28 branches across Regions A/B/C.
  **No admin UI and no self-signup** — seed or direct DB writes only.
- Next-15 idioms already match OSC's conventions: Promise-typed
  `params`/`searchParams` (awaited), `export const dynamic =
  "force-dynamic"`, server actions + `revalidatePath`, no middleware
  dependency (flow's `middleware.ts` is a no-op), no webpack config, no
  basePath/rewrites.

### Target — this repo

- **Next 16.2.4** (Turbopack default; config is `next.config.ts`), React
  19.2.4, Tailwind v4 CSS-first (`globals.css` with `@import "tailwindcss"`
  + `@theme inline`), **Prisma 7.7.0 with `@prisma/adapter-pg`**, next-auth
  v5 beta (`src/auth.ts` exports `auth`; JWT sessions; Credentials provider).
- Prisma config lives in `prisma.config.ts` (single schema,
  `DATABASE_URL`); **no migrations directory** — schema changes applied via
  `prisma db push` / manual SQL; Docker + CI run `prisma generate` only.
- Guarding pattern (no middleware): server pages `await auth()` +
  `redirect("/login")`; route handlers return 401/403; client components use
  `useSession`. Session extras (`role`, `position`, `branchName`) read via
  inline casts — no `next-auth.d.ts`.
- Protected pages render inside `src/app/components/AppShell.tsx`
  (client; takes `email`/`role`/`name` props; renders Sidebar + TopBar).
- Deploy: single `osc` compose service (port 3004:3000, `env_file: .env`,
  network `ebright-v2-net`); `deploy.yml` SSHes per branch (staging/prod
  VPS), git-syncs, `docker build` + `compose up -d`. `DATABASE_URL` is
  expected to pre-exist in the host's `.env` — the workflow never writes it.
- OSC already depends on `@dnd-kit/*`, `date-fns`, `resend`, `zod` is
  **absent** (must be added).
- `node_modules` is not currently installed, so the Next 16 guides at
  `node_modules/next/dist/docs/` (mandated reading per `AGENTS.md`) could
  not be read during design. All divergence claims above are grounded in
  this repo's actual code.

## 4. Phasing

**Phase 0 — groundwork (first implementation steps, before any code):**
`npm install`, then read the relevant Next 16 guides in
`node_modules/next/dist/docs/` (app router conventions, route handlers,
dynamic APIs, config, caching) per the AGENTS.md mandate. Confirm baseline
`npm test` / `tsc` / `next build` are green before touching anything.

**Phase 1 — port & replace (deliverable: functional frontend on seeded
local data).** All Task Manager code merges in natively; the HTTP bridge and
secret plumbing are dropped; the old ClickUp feature is deleted; sidebar and
homepage repoint to "Task Manager"; dead ClickUp env injection removed from
deploy.yml. Verified against an `ebright_task_manager` database created on
the dev Postgres server, migrated and seeded with flow's demo data.

**Phase 2 — environment cutover (staging first, then production).** Per
environment: create the `ebright_task_manager` database on that
environment's Postgres server → `tm:migrate` → run the idempotent bootstrap
(utility flows + real staff roster) → set `TASK_MANAGER_DATABASE_URL` in the
host `.env` → deploy → smoke-test the role matrix.

**Later phases (out of scope here):** Redis + reminder worker
(reminders/escalations + their emails), S3 file uploads, live
`TaskProgressCard` on the OSC homepage, admin UI for user management,
secret rotation.

## 5. Code layout & porting map

Feature library at `src/task-manager/`, thin pages at
`src/app/task-manager/`.

| Source (`D:\ebright-flow`) | Destination | Notes |
|---|---|---|
| `src/osc/*` (except `flow-client.ts`) | `src/task-manager/ui/*` | Near-verbatim; `clickup-tasks-view.tsx` → `task-manager-view.tsx`; user-visible "ClickUp" strings relabeled; internal identifiers (`Flow*` types, function names) kept as-is to avoid churn risk |
| `src/osc/flow-client.ts` | `src/task-manager/data.ts` | **Keystone swap** — same exported function signatures (`getFlowOverview`, `getFlowDetail`, `getFlowStaff`, `getDepartmentDetail`, `get/saveCeoDashboardConfig`, `assignFlowTask`, `completeFlowTask`, `skipFlowTask`, `reopenFlowTask`, all manpower + hod-kanban functions), reimplemented as direct in-process calls to the payload builders / engine / manpower helpers. No fetch, no secret, no `FLOW_INTERNAL_URL` |
| `src/app/api/analytics/{_lib,_payloads}.ts` + tests | `src/task-manager/analytics/*` | Payload builders, role scoping, fixed department/region data |
| `src/app/api/internal/_manpower.ts` | `src/task-manager/manpower.ts` | Manpower write helpers |
| `src/app/api/internal/*` route logic | folded into `data.ts` | The ~20 HTTP routes are **not** ported as routes — they were thin wrappers. `_auth.ts` (secret check) dies; `requireUserByEmail` survives as the session-email → User lookup |
| `server/engine/*` (`run`, `snapshot`, `conditions`, `reminders`) | `src/task-manager/engine/*` | `reminders.ts` gains the `REDIS_URL`-unset → no-op queue guard. Worker entrypoint (`server/workers/`) and email templates stay behind unless the engine's import graph pulls them in (typecheck decides); they arrive with the future reminders phase |
| `src/lib/users.ts`, error helpers from `src/lib/api-server.ts` | `src/task-manager/lib/*` | `ApiHttpError` semantics kept so pages can distinguish 403 vs "no account" (404) |
| — (new) | `src/task-manager/prisma.ts` | Prisma 7 `adapter-pg` singleton, `TASK_MANAGER_DATABASE_URL`, global-cached, UTC, pooled — mirrors `src/lib/prisma.ts` |
| — (new) | `src/task-manager/ui/status-cards.tsx` | Small component modeled on the demo's `BridgeErrorCard`: "no Task Manager account yet" (unknown email) and "Task Manager is being set up" (env unset) states |
| `prisma/schema.prisma` + `prisma/migrations/*` + `seed.ts` | `prisma/task-manager/{schema.prisma, migrations/, seed.ts}` | Schema upgraded to Prisma 7 conventions; migration history carried over |
| — (new) | `prisma/task-manager/bootstrap.ts` + `roster.csv` | Phase 2 idempotent provisioning (see §8) |
| `src/app/osc-demo/*` | not ported | Reference only for host-page wiring |
| Flow app shell, providers, middleware, Docker files | not ported | |

**Pages (`src/app/task-manager/`)** — modeled line-for-line on the
`osc-demo` pages with two substitutions: `await auth()` +
`redirect("/login")` replaces the `?email=` param (acting email =
`session.user.email`), and OSC's `AppShell` replaces the demo's gray canvas.

- `page.tsx` — main role-scoped view. Fetches daily + monthly + staff
  (+ CEO dashboard config / HOD kanban when the role matches), defines the
  server actions (`assign`, `completeTask`, `skipTask`, `reopenTask`, CEO
  actions, kanban actions) each closing over the session email, calls
  `revalidatePath` after mutations, renders `task-manager-view`.
- `department-overview/page.tsx` — `?department=` query param (matching
  ported code).
- `manpower-schedule/page.tsx` — `?date=` query param.

**Error/edge behavior:** session email with no Task Manager User row →
quiet "no account yet" card. `TASK_MANAGER_DATABASE_URL` unset → "still
being set up" card (this decouples shipping Phase 1 from executing Phase 2).
Other data-layer failures → the existing error-card pattern.

**Styling:** both repos are Tailwind v4 CSS-first and the UI package uses
literal utility classes only, so no token/config reconciliation is needed;
v4 source detection picks up `src/task-manager/ui/*` automatically.

## 6. Data layer: dual Prisma, database, Redis/email

### Second Prisma setup (flow schema, Prisma 6 → 7)

- `prisma/task-manager/schema.prisma`: datasource block keeps
  `provider = "postgresql"` with the URL supplied per Prisma 7 convention
  (config + driver adapter, not in-schema). Generator gets a **custom
  output** — `src/generated/task-manager-client` (added to `.gitignore`) —
  so it cannot collide with OSC's default `@prisma/client` output.
- New `prisma.task-manager.config.ts` drives the CLI via `--config`:
  schema path, `migrations.path: "prisma/task-manager/migrations"`, URL from
  `TASK_MANAGER_DATABASE_URL`.
- **Migration strategy:** keep flow's 18-migration history and use
  `prisma migrate deploy` for this schema (deterministic against fresh
  databases). OSC's own schema keeps its existing `db push` habit —
  unchanged. Migrations remain **manual** (no CI migrate step), matching how
  this repo already operates; cutover command:
  `npm run tm:migrate` (= `prisma migrate deploy --config prisma.task-manager.config.ts`).
- Client singleton `src/task-manager/prisma.ts` instantiates through
  `@prisma/adapter-pg` exactly like OSC's `src/lib/prisma.ts` (global-cached,
  `-c TimeZone=UTC`, pooled), reading `TASK_MANAGER_DATABASE_URL`.
- **npm scripts:** `tm:generate`, `tm:migrate`, `tm:seed`, `tm:bootstrap`.
  Dockerfile and the CI validate job each add the second generate call after
  the existing `npx prisma generate`.

### Database

`ebright_task_manager`, created on the **same Postgres server** OSC's
`DATABASE_URL` points at — the dev server during Phase 1, each
environment's server at its Phase 2 cutover. `TASK_MANAGER_DATABASE_URL`
carries a full connection string, so "same server" is convention, not code.

### Upgrade risk (Prisma 6 → 7)

Flow's schema uses only standard features; the client API is mostly
compatible. Safety net: ported vitest suites (analytics lib + payloads +
`types.test.ts`) plus `tsc` catch query-level drift.

### Redis / email / S3

- `bullmq` + `ioredis` are installed but **inert**: `reminders.ts` gains a
  guard so an unset `REDIS_URL` yields a no-op queue (log and skip).
  Complete/skip/reopen/assign and manpower publish all work; automatic
  reminders, escalations, and their emails simply don't fire until Redis +
  the worker arrive in a later phase — at which point they light up without
  code changes.
- `RESEND_API_KEY` / `EMAIL_FROM` stay optional (email is dormant until the
  reminders phase; flow already logs to console when the key is empty).
- **No S3**: the merged UI surface never renders file-upload items
  (quick-assign creates single-checkbox tasks only).

### New OSC dependencies

`zod`, `bullmq`, `ioredis`; `@dnd-kit/*` versions aligned with flow's at
implementation time (both repos already use it).

## 7. OSC-side integration: removal, entry points, env & CI

### Removal (exact list)

Delete:

- `src/app/clickup-dashboard/` — `page.tsx`, `operations/page.tsx`,
  `[spaceId]/page.tsx`
- `src/app/tasks/page.tsx` (orphaned but URL-reachable)
- `src/app/api/clickup/` — all 7 route files (`tasks`, `branches`,
  `branches/[spaceId]`, `branches/[spaceId]/tasks`, `departments`,
  `departments/[deptId]`, `operations`)
- `src/lib/clickup.ts`, `src/lib/clickup-access.ts`,
  `src/lib/clickup-queries.ts`, plus `clickup.test.ts` and
  `clickup-access.test.ts`
- `src/app/components/ClickUpTaskListModal.tsx`

Keep / don't touch:

- **`src/app/components/StatusDonut.tsx` stays** —
  `LeaveRequestsView.tsx` depends on it.
- CRM mock platform names (`CrmTicketPlatformsPage.tsx`,
  `CrmTicketNewPage.tsx`) and induction training text
  (`induction-task-spec.ts`, `induction/templates.ts`) are word-only
  references — untouched.

Cosmetic: `BranchDashboard.tsx`'s hardcoded mock donut relabels
"Monthly ClickUp" → "Monthly Tasks" (one line; the data was always mock).

### Entry points

- `Sidebar.tsx` L138: `{ name: "Task Manager", href: "/task-manager",
  Icon: ListChecks }`.
- `DashboardHome.tsx` L91–100 tile: id `clickup` → `task-manager`, title
  "Task Manager", primary link `/task-manager`, secondary link
  `/task-manager/manpower-schedule` (replacing `/operations`).
- Nav stays visible to everyone (matching current sidebar behavior — it has
  no role gating); the page guards via `auth()`, and staff without a Task
  Manager account get the quiet no-account card.

### Env & CI

- `deploy.yml` **L84–87** (ClickUp token/team `sed`/`printf` injection)
  deleted. The Google service-account lines (L89–95) stay — they belong to
  the separate secret-rotation effort.
- Only new env var: `TASK_MANAGER_DATABASE_URL`, set manually in each VPS's
  `.env` at that environment's cutover (exactly how `DATABASE_URL` is
  handled today). Any `CLICKUP_*` mentions in `.env.example`/docs cleaned
  up.

## 8. Provisioning (Phase 2 bootstrap)

`prisma/task-manager/bootstrap.ts` — **idempotent**, safe to re-run:

- Upserts the 5 quick-assign utility flows (creation logic extracted from
  the demo seed, minus the wipe).
- Upserts staff Users from a checked-in roster
  `prisma/task-manager/roster.csv` with columns
  `email,name,role,department,branch,employmentType,coachSchedule`.
- Validates against the fixed 6 departments / 28 branches / role enum and
  refuses unknown values.
- Emails must match OSC login emails (matching is case-insensitive — flow
  lowercases on lookup).

Ops fills the roster before cutover. Re-running bootstrap after editing the
roster is the user-management story until an admin UI exists. The demo
`seed.ts` remains **dev-only** (it wipes the database it points at).

## 9. Verification & rollout

**Automated:** ported vitest suites pass under `npm test`; `tsc` clean;
`next build` green; OSC's existing tests unaffected.

**Manual role matrix (dev, seeded data):** MEMBER / HOD / BRANCH / CEO /
OPS / ADMIN views render with correct scoping; assign → complete → skip →
reopen round-trips; manpower schedule create/edit/publish (publish creates
linked ad-hoc tasks); HOD kanban CRUD + drag. Dev verification logs in with
OSC dev accounts whose emails are added to the seed's user list (small
seed-time edit).

**Regression checks:** old routes (`/clickup-dashboard`, `/tasks`,
`/api/clickup/*`) return 404; sidebar and homepage tile navigate correctly;
`LeaveRequestsView` donut still renders; no remaining imports of
`@/lib/clickup*`.

**Rollout:** normal staging → main flow. Phase 2 cutover executes on
staging first and is verified there before production. Until an
environment's cutover runs, `/task-manager` shows the "being set up" card
there. **Timing note (user's call):** the moment Phase 1 deploys to an
environment, staff there lose the old ClickUp dashboards.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Next 16 divergences not yet read (node_modules absent at design time) | Phase 0 mandates installing deps and reading `node_modules/next/dist/docs/` before code; flow already matches the known-hard parts (Promise params, force-dynamic, no middleware/webpack) |
| Prisma 6 → 7 API drift in engine/analytics queries | Ported vitest suites + `tsc`; adapter-pg singleton mirrors OSC's proven setup |
| Two Prisma clients in one app (output collision, config confusion) | Custom generator output + separate config file + separate npm scripts; OSC's existing setup untouched |
| Redis-dependent write paths | Explicit no-op guard on `REDIS_URL`; deps installed but inert; verified by exercising write paths in dev without Redis |
| Unknown-user experience post-launch | No-account card + roster/bootstrap process; nav intentionally visible to all |
| Live feature removal | Staging-first rollout; user times the production deploy/comms |

## 11. Out of scope

Redis + reminder worker (and reminder/escalation emails), S3 file uploads,
live `TaskProgressCard` on the OSC homepage, admin UI for Task Manager
users, automated user sync from OSC's `users` table, secret rotation
(leaked ClickUp token + Google key in git history — separate coordinated
effort), and archival mechanics of `D:\ebright-flow` beyond "stop developing
there once the merge is verified."
