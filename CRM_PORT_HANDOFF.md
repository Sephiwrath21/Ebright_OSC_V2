# CRM Port — Handoff / Continuation Prompt

**Paste the section below to Claude Code in VS Code (this repo) to continue the work.**
Everything here is already DONE and on disk in this repo, on branch `feat/port-crm-from-v1`,
unless a line says "TODO".

---

## Context (what this is)

The full **CRM module** from the v1 app (`Ebright_OSC`, a Next 15 / React 18 / Prisma 6 /
better-auth / Tailwind 3-root-based app) has been **ported into this repo** (`Ebright_OSC_V2`,
a Next 16 / React 19 / Prisma 7 / next-auth v5 / Tailwind 4 `src/`-based app), **replacing V2's
old read-only CRM**. Both apps point at the **same live `ebright_crm` database** — v1 owns the
schema; V2 now runs the full read/write CRM UI + API against it.

The port is **compiling, building, and running with real data**. It was verified end-to-end:
`/crm/dashboard`, `/crm/opportunities`, `/crm/tickets` all return HTTP 200 with live data
(44,906 opportunities in the DB).

## How the port was structured (key decisions — don't undo these)

1. **File layout.** v1 was root-based (`@/` → repo root). V2 is `src/`-based (`@/` → `src/`).
   The CRM folders were copied to the mirrored paths under `src/`, so `@/…` imports resolved
   with **zero path edits**:
   - `src/app/crm`, `src/app/api/crm` (replaced V2's old CRM routes)
   - `src/components/crm`, `src/components/ui`, `src/hooks/crm`, `src/lib/crm`, `src/server`
   - Shared helpers also brought over: `src/lib/mailer.ts`, `src/lib/googleDrive.ts`,
     `src/app/fa-system/_types`
   - `src/server/workers/` was **intentionally dropped** (BullMQ background jobs; not needed
     for the UI/API and they dragged in HR-only deps). Automations/digests won't fire until
     workers are wired back — a later task.

2. **Second Prisma client for the CRM.** The CRM has its own generated client, exactly like
   this repo's task-manager client:
   - Schema: `prisma/crm/schema.prisma` (full v1 schema; `generator.output = ../../src/generated/crm-client`)
   - Config: `prisma.crm.config.ts` → `datasource.url = process.env.CRM_DATABASE_URL`
   - npm scripts: `npm run crm:generate`, `npm run crm:validate`
   - Client wiring: `src/lib/crm/db.ts` uses `@/generated/crm-client` + `PrismaPg` adapter.
   - **CRITICAL GOTCHA:** the CRM tables live in the Postgres **`crm` schema**, and
     `crm_auth_user` (etc.) ALSO exist in `public` (near-empty) and `old_import`. The PrismaPg
     driver adapter ignores both the `?schema=crm` URL param AND libpq `-c search_path`. The
     ONLY reliable fix is the adapter's **second argument** `new PrismaPg({...}, { schema: 'crm' })`.
     This is already set in `src/lib/crm/db.ts`. If you ever see the CRM "authenticated but no
     data / user not found", this is why.
   - All `@prisma/client` imports inside the CRM were rewritten to `@/generated/crm-client` (15 files).

3. **Auth.** v1's CRM authenticates via **better-auth**, but its `auth.api.getSession` is a
   BRIDGE: it reads the portal session and provisions a `crm_auth_user` + branch link. That
   bridge was adapted to call **V2's next-auth v5 `auth()`** (`src/lib/crm/auth.ts`,
   `readNextAuthEmail`). So one portal login should flow into the CRM. Also, **preview mode**
   (`CRM_PREVIEW_MODE=true`, dev-only, refuses in production) synthesises an `admin@ebright.my`
   session so the CRM is browsable locally without logging in — this is how it's verified now.

4. **Middleware.** V2 has no middleware; route protection is per-page/route. The CRM's own
   protected layout guards access. v1's HRMS middleware (read-only-viewer block, employee
   lockdown) was NOT ported (it needed HR-only libs). Deferred hardening.

5. **Styling.** Both apps are Tailwind v4. Added to `src/app/globals.css`: `@custom-variant dark`,
   `--ring` token, `.dark` overrides, and the CRM's `.cns-scroll` / marquee / spin-slow utilities.

6. **Sidebar.** `src/app/components/Sidebar.tsx` — the "CNS" item + its Lead/Ticket children
   were pointed at the ported routes (Lead links already matched; Ticket links changed from
   `/crm/ticket/*` to `/crm/tickets/*` + `/crm/tkt-platforms`; parent → `/crm/dashboard`).

7. **Dependencies.** ~31 CRM packages were added to `package.json` (radix, tanstack-query/table,
   reactflow, recharts, framer-motion, @hello-pangea/dnd, react-hook-form, sonner, better-auth,
   etc.). Installed with `--legacy-peer-deps` (React 19 peer ranges). `lucide-react` is V2's
   1.x — brand icons `Facebook`/`Youtube` don't exist there, swapped for `Megaphone`/`Video`
   in `src/components/crm/integrations/integrations-page.tsx`.

## Environment (`.env`, gitignored)

Built from v1's `.env`. Key vars:
- `CRM_DATABASE_URL` = the live `ebright_crm` (schema `crm`) — this is the CRM's data. **Correct.**
- `DATABASE_URL` / `HRFS_DATABASE_URL` = V2's PORTAL db (the `users` table for next-auth). This
  was set to v1's `HRFS_DATABASE_URL` as a **GUESS** — see TODO below.
- `LEADS_DB_URL`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, `BETTER_AUTH_SECRET`, `CRM_PREVIEW_MODE=true`,
  `DISABLE_BG_POLLERS=1`.

## How to run / verify

```bash
npm run crm:generate      # generate the CRM Prisma client (if src/generated/crm-client missing)
npx prisma generate       # main client
npx prisma generate --config prisma.task-manager.config.ts   # tm client
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit       # typecheck (see note below)
npm run dev               # then open http://localhost:3013/crm/dashboard
```

- **Typecheck note:** `tsc` needs a big heap or it OOMs. As of 2026-08-06 a full
  `npx tsc --noEmit` shows only **3 pre-existing errors**, all in V2's OWN HR code
  (`api/branch/dashboard/route.ts` ×2, `ClickUpPieChart.tsx`) — not from the CRM; V2 ships them
  via `next.config.ts` `typescript.ignoreBuildErrors: true`. The ported CRM itself is **0 errors**.
- **Production build** (`npm run build`) passes. If it fails with `Cannot find module
  '.prisma/client/default'`, run the three `prisma generate` commands above first.

## TODO (what's left)

1. **Real portal login → CRM bridge — BLOCKED on repo owner.** Confirm V2's ACTUAL portal/`users`
   database URL and put it in `DATABASE_URL`, then set `CRM_PREVIEW_MODE=false` and verify a real
   login flows into the CRM (bridge in `src/lib/crm/auth.ts`).
   Investigated 2026-08-06 (probe from this dev machine):
   - Current `DATABASE_URL` (v1's `HRFS_DATABASE_URL` guess — `ebright_hrfs` on the shared DB
     host, port 5432) **times out** — port 5432 is unreachable from this machine (likely
     LAN/VPN-only).
   - `ebright_hrfs` ALSO exists on the reachable `:5433` instance, but its `public.users` is
     **empty (0 rows)** — a schema copy, NOT the live portal. Don't point `DATABASE_URL` at it.
   - `crm.hrfs_users` FDW view IS reachable via `CRM_DATABASE_URL` (236 rows) — branch
     auto-linking will work once real auth does.
2. **Background workers** (`src/server/workers/` was dropped) — port back if automations / email
   digests / reminders are needed. Needs Redis (`REDIS_URL`).
3. **Middleware hardening** (read-only-viewer write block, employee lockdown) — optional.

## Resolved since the original handoff (2026-08-06)

- **`DISABLE_BG_POLLERS` (was TODO #2) — works.** `.dev.log` line 9 shows
  `[instrumentation] background pollers disabled via DISABLE_BG_POLLERS` and no scanner-sync
  output after it. The "still runs" note was stale (a dev server started before the var was
  added). The `[CRM-AUTH-DEBUG]` log noise had also already been removed from source.
- **Old-CRM cleanup (was TODO #4) — done.** Deleted 13 orphaned components
  (`src/app/components/Crm*.tsx`, `LeadsDashboard.tsx`, `OpportunitiesBoard.tsx`) and all 10 flat
  `src/lib/crm-*.ts` libs. The one live consumer, `src/app/api/od/dashboard/route.ts`, was
  repointed to a new `src/lib/crm/ticket-counter.ts` (same per-platform tally SQL, now on the CRM
  Prisma client, lazy-imported so a missing `CRM_DATABASE_URL` still degrades to the demo table).
  `src/app/dashboards/crm/page.tsx` + `CrmDashboard.tsx` were KEPT — the ported CRM links/redirects
  to `/dashboards/crm` (carryover from v1, where `dashboards/[id]` catches it) — but its two module
  cards now point at the ported routes (`/crm/dashboard`, `/crm/tickets`) instead of the deleted
  `/crm/lead` / `/crm/ticket`. `.legacy-v2-crm/` backup still on disk.

## Guardrails

- **Do NOT touch the v1 repo** (`D:\OSC\Ebrigth_OSC` / `Ebright_OSC`) — it's the source of truth
  and must stay intact.
- Work stays on branch `feat/port-crm-from-v1`. Nothing was committed yet (waiting on the repo
  owner). `.env` is gitignored — keep secrets out of commits.
