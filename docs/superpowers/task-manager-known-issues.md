# Task Manager — Known Issues (Post-Migration)

- **Date:** 2026-07-24
- **Status:** Living record — update as items close or new ones surface
- **Context:** consolidated from in-code review comments across the migration
  (see `docs/superpowers/specs/2026-07-23-task-manager-native-merge-design.md`)
  plus Task 20's verification sweep. Every item was re-verified against
  current source on 2026-07-24, not copied from memory.

## Deferred by design (spec §11)

- **Redis + reminder worker.** Reminders/escalations are dormant while
  `REDIS_URL` is unset. `scheduleReminder`
  (`src/task-manager/engine/run.ts:91-123`) warns calmly only for the known
  "REDIS_URL is not set" case (`console.error` otherwise); the guard is
  `getReminderQueue()` (`src/task-manager/lib/queues.ts:22-30`), which throws
  synchronously instead of letting ioredis retry localhost forever.
  Escalation only fires from a reminder job firing (`engine/reminders.ts`),
  so it's dormant too. Acceptable: spec §11. Next: stand up Redis + the
  worker (spec §6) when reminders are needed.
- **S3 file uploads.** The `FILE_UPLOAD` item type's config schema exists
  (`src/task-manager/lib/item-schemas.ts:211`, "stored in S3") but there's no
  upload route and no AWS SDK in `package.json`. Acceptable: spec §11. Next:
  implement the handler + add the SDK when this item type goes live.
- **Live `TaskProgressCard` on the OSC homepage.** The component
  (`src/task-manager/ui/task-progress-card.tsx`) and its install
  instructions (`src/task-manager/ui/README.md`) exist, but the real
  homepage (`src/app/home/page.tsx`) doesn't import it — it renders
  `DashboardHome`/`EmployeeSelfServiceDashboard`/`FinanceDashboard`, none of
  which reference the card. Acceptable: spec §11. Next: wire it in per the
  README's "Install into OSC" section (still describes the old HTTP-bridge
  design — see Dev-environment notes — so update it while wiring).
- **Admin UI for Task Manager users.** No admin route exists —
  `src/app/task-manager/` has exactly the 3 pages in the route table.
  Acceptable: spec §11; `npm run tm:bootstrap` re-runs against HRFS are the
  story today. Next: build one once file-based `OVERRIDES`/`EXTRA_USERS`
  maintenance gets painful enough.

## Donor-parity known windows (hardening candidates)

- **`publishSchedule`** (`src/task-manager/data/manpower.ts:388-434`) —
  in-file comment (410-412): a crash between `createSlotRun` and the
  link-back `scheduleSlot.update` can orphan a run; re-publishing then
  duplicates that slot's task.
- **`renameScheduleRow`** (same file, 156-207) — same class of exposure, not
  called out in a comment: the per-slot loop (178-204) updates the slot to
  the new time, then its linked `runBlock`/`flowRun`, in separate awaited
  calls with no transaction. A crash between them strands the task at the
  old title/time — and since a retry's query filters on the *old* start/end
  time, an already-moved slot falls outside that filter and never gets fixed.
- Suggested fix (both): wrap each slot's cross-table sync in one Prisma
  transaction.
- **CEO config last-write-wins** (`src/task-manager/data/ceo.ts:65-66`) —
  in-file comment: "Known, accepted last-write-wins: single-owner preference
  data; overlapping actions self-heal via revalidatePath on next render."
  Accepted as-is.

## UI polish candidates

- **Optimistic updates without rollback** — `hod-kanban.tsx:446-458`
  (explicit comment: failure "only surfaces the message, it does not roll
  the optimistic change back") and `ceo-dashboard.tsx`'s `handleDragEnd`
  (151-164: `setOrder(next)` at line 159 is never reverted on `{ ok: false
  }`). Donor-parity; `useEffect` reconciliation from server props
  (`ceo-dashboard.tsx:137-139`) corrects the view on the next revalidate.
- **`InlineActionError`** (`src/task-manager/ui/bits.tsx:14-24`) has no
  click-away or auto-dismiss — persists until the next action attempt clears
  it. Per the file's own comment it deliberately reuses the dropdown
  popovers' chrome (bordered white card, shadow), just not their dismiss
  behavior.
- **Pre-existing lint debt**, reconfirmed 2026-07-24 (`npx eslint
  src/task-manager src/app/task-manager --no-error-on-unmatched-pattern
  --format json`): `react-hooks/set-state-in-effect` ×6,
  `react-hooks/error-boundaries` ×5 (previously logged as ×1 — corrected
  here), `react-hooks/immutability` ×1, `@typescript-eslint/no-unused-vars`
  ×2, `react/no-unescaped-entities` ×2 — 16 total (14 errors, 2 warnings).
  Lint-only; `tsc --noEmit` and `next build` are both clean.

## HRFS mapping — decisions pending (user)

All decisions land in `prisma/task-manager/hrfs-map.ts`'s `OVERRIDES`/
`EXTRA_USERS` (both empty today, with worked examples in the file's own
comments). Counts below are from the 2026-07-24 `tm:bootstrap --dry-run`
(183 fetched / 171 mapped / 12 skipped / 48 no-department warnings):

- **1 HOD** needs a department override (`hrfs-map.ts:100-101`, `:502`) —
  `iqbalhakim216@gmail.com` in the dry run.
- **Branch codes DPU and IOP unresolved** (`hrfs-map.ts:284`, `:289`). DPU
  blocks 4 people today (2 BRANCH_MANAGER + 2 PT Coach); IOP blocks nobody
  today (only 1 INT row, and INT doesn't require a branch) but is still an
  unidentified code worth chasing down.
- **FT EXEC semantics** — all 4 live rows carry HQ(×2)/MKT/OD as their
  branch value, not a real branch (`hrfs-map.ts:110-121`) — branch-exec vs.
  HQ-exec call pending.
- **Full_Time/Part_Time (2+32=34 rows, `hrfs-map.ts:78-80`)** — 33 of 34
  carry real, resolvable branch codes (`hrfs-map.ts:126-136`) —
  dept-staff-per-spec vs. actually-branch-staff call pending.
- **CEO/OPS identities unassigned** — `kevinkhoo@ebright.my` carries
  branchName `"CEO"` (`hrfs-map.ts:283`; confirmed in the dry run) — a
  promotion-via-`OVERRIDES` candidate.
- **Site-account logins** — `EXTRA_USERS` is empty (`hrfs-map.ts:379`; dry
  run confirms "EXTRA_USERS appended: 0").

## Separate efforts (not this migration)

- **Secret rotation.** The leaked ClickUp API token's injection step was
  removed from `.github/workflows/deploy.yml` by commit `50a3d46`; the token
  itself is still recoverable from git history, so it needs rotation
  regardless. **Correction to the design spec's §11 assumption:** the Google
  Drive service-account credentials were *not* similarly cleaned up — email,
  private key, and folder ID are still hardcoded and injected live on every
  deploy (`deploy.yml:85-92`, the `printf` lines after the
  `GOOGLE_DRIVE_SA_*`/`GOOGLE_DRIVE_FOLDER_ID` `sed -i` deletes). This is a
  currently active exposure, not merely historical. Next: rotate the key and
  replace the literal value with a GitHub Actions secret.
- **CEP page's own hosting/CI gap.** `apps/cep` (commit `f26e804`, already
  on `main`) is a fully separate Next.js/Prisma/SQLite process meant to run
  on its own port (3010) behind a same-origin rewrite. Neither `deploy.yml`
  nor `docker-compose.yml` references it, so nothing tracked builds or runs
  it.

## Dev-environment notes

- **vitest must run via PowerShell.** Git Bash has a reported
  drive-letter-casing quirk that yields spurious whole-suite failures.
  During Task 20's sweep, `npx vitest run` and `npm test` were also tried
  via Git Bash and did *not* reproduce it (9 files / 202 tests, matching
  PowerShell) — keep using PowerShell regardless since that's the verified
  path; worth a maintainer re-checking whether this is still live,
  intermittent, or already fixed.
- **Stale `.next/types` after deleting routes** can fail `tsc --noEmit`
  until `.next/` is removed and regenerated. Not hit this sweep (a
  pre-existing `.next/` was present and `tsc` was clean first try) — still
  worth knowing before assuming a route-shape tsc error is real.
- **Dev TM database is named `ebright_yqtm`** — an operator's environment
  choice (`TASK_MANAGER_DATABASE_URL` in the local `.env`; also used as an
  example in `prisma/task-manager/bootstrap.ts:34`'s comment). Runbook
  references should use the env var, not this hardcoded name.
