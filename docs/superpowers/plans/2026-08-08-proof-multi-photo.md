# Proof of Completion: Multi-Photo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user attach up to 5 proof-of-completion photos per task (currently strictly one, replace-on-reupload), shown as a gallery of thumbnails each individually removable. Also stop the "📷 Take Photo" button from forcing straight into the camera on mobile — it should open the same camera-or-gallery picker "📁 Upload File" already does.

**Architecture:** `Proof` is currently 1:1 with `RunBlock` (`runBlockId String @unique`) and every upload does an upsert-and-replace (deleting the old Drive file). This becomes 1:many — drop the unique constraint, change uploads from replace to append (with a 5-photo cap), and add a new remove-one-photo action that deletes just that row and trashes just that Drive file. The image-serving proxy route (`/api/task-manager/proof-image/[id]`) is ALREADY keyed on the individual `Proof` row's own id, not the task's — it needs zero changes. Drive filenames already bake in `Date.now()`, so multiple uploads for the same task never collide there either. The UI (`ProofCell` in `src/task-manager/ui/bits.tsx`) currently manages a single nullable staged image and a single confirmed proof id; this becomes a list, with each "add a photo" action still uploading immediately (no new batch/staged-save concept — unlike the Package Table work, this feature doesn't need one, since each photo is independent and the existing "pick → compress → upload → done" pipeline per photo is already correct, just needs to run N times instead of replacing itself).

**Tech Stack:** Next.js 16 App Router / Server Actions, Prisma (Task Manager's own `TASK_MANAGER_DATABASE_URL` client), Google Drive API (`src/lib/drive.ts`, shared with the HR module — do not modify), Vitest.

---

## Confirmed design decisions (do not deviate)

1. **Max 5 photos per task.** Enforced server-side (reject the 6th upload attempt with a clear error) — this is a NEW check, nothing like it exists today.
2. **Uploading a new photo APPENDS, never replaces or deletes an existing photo.** The current upsert-and-trash-the-old-file behavior is being removed entirely for the upload path.
3. **Removing a photo is a new, separate, explicit action** — deletes that one `Proof` row and trashes that one Drive file (reusing `deleteFromDrive`, same as today's replace-path already does for the file it's discarding). Removing one photo must never affect any other photo on the same task.
4. **Same ownership/past-due guards apply to both upload and remove** — `runBlock.assigneeId !== user.id` → 403, and (for `cadence:"DAILY"` blocks) a day that's already past → 400 "can no longer accept proof." Apply this symmetrically to the new remove action too (a task whose day has passed shouldn't have its evidence altered either way) — call this out explicitly in code review since it's a judgment call, not something the user was asked to confirm directly.
5. **No batch/staged-upload UI concept.** Each "add a photo" action (file picker, camera, drag-drop, paste) immediately compresses and uploads that one photo, exactly like today's flow — just appending to a list instead of replacing the one slot. Do not introduce Package-Table-style local pending-state/Save-button machinery here; it isn't needed and would be unnecessary complexity for this feature.
6. **"📷 Take Photo" keeps its own button** (not merged with "📁 Upload File") — only its `capture="environment"` forcing is removed, so on mobile both buttons end up opening the same camera-or-gallery picker. Desktop's separate live-`getUserMedia`-webcam flow (triggered by the same button on non-mobile) is unaffected — that's a genuinely different code path, not a file-input `capture` attribute.
7. **Do not touch** `src/lib/drive.ts` (the shared Drive helper, also used by the HR module) or the proxy route `src/app/api/task-manager/proof-image/[id]/route.ts` (already correctly keyed per-photo, needs zero changes) — reuse both exactly as they are.

---

## Task 1: Schema — allow multiple `Proof` rows per `RunBlock`

**Files:**
- Modify: `prisma/task-manager/schema.prisma`
- Create: `prisma/task-manager/migrations/<timestamp>_proof_multi_photo/migration.sql`

- [ ] **Step 1: Read the current `Proof` model and its relation on `RunBlock`**

Read `prisma/task-manager/schema.prisma` in full, find `model Proof` and `RunBlock.proof`. Current shape:
```prisma
model Proof {
  id          String   @id @default(cuid())
  runBlockId  String   @unique
  runBlock    RunBlock @relation(fields: [runBlockId], references: [id], onDelete: Cascade)
  driveFileId String?
  createdAt   DateTime @default(now())
}
```
and, inside `model RunBlock`: `proof Proof?`.

- [ ] **Step 2: Change the relation to one-to-many**

```prisma
model Proof {
  id          String   @id @default(cuid())
  runBlockId  String
  runBlock    RunBlock @relation(fields: [runBlockId], references: [id], onDelete: Cascade)
  driveFileId String?
  createdAt   DateTime @default(now())

  @@index([runBlockId])
}
```
(Drop `@unique` from `runBlockId`, add `@@index([runBlockId])` to replace the query-acceleration role the unique index used to serve.)

In `model RunBlock`, change `proof Proof?` to `proofs Proof[]`. Grep the WHOLE repo for `.proof` (Prisma relation accessor usage, e.g. `include: { proof: ... }`, `select: { proof: ... }`, `block.proof`, `b.proof`) — every one of these needs to become `.proofs` (plural) as part of THIS schema change being consistent, but the actual CALLERS of those sites are Task 2/3's job to update; this task only needs to confirm you've found and listed every call site so later tasks know exactly what to fix (do not fix them here, just enumerate them in your task report).

- [ ] **Step 3: Write and apply the migration**

This is a SHARED, LIVE database. Check `npx prisma migrate status --config prisma.task-manager.config.ts` first. Earlier migrations on THIS database found `prisma migrate dev --create-only` proposing to drop unrelated, unmodeled raw tables (`adhoc_task`, `daily`, `hod_assigned_task`) — hand-write the migration SQL instead, following the exact style of the `BranchPackageSchedule` migrations from the immediately-prior features (`prisma/task-manager/migrations/20260807100000_add_branch_package_schedule/migration.sql` and its follow-ups) — `DROP INDEX`/`ADD ... @@index` equivalents, not a `migrate dev` diff. Apply via `npx prisma migrate deploy --config prisma.task-manager.config.ts`, then `npx prisma generate --config prisma.task-manager.config.ts`.

**This migration has real data to consider**: unlike the brand-new `BranchPackageSchedule` table, `Proof` already has LIVE rows from real completed tasks. Confirm before writing the migration that dropping a `@unique` constraint (a pure loosening) cannot lose or corrupt any existing row — it can't, by construction, but verify this explicitly via a row-count check before/after, same discipline as the `BranchPackageSchedule` constraint-loosening migration used.

Live-DB verification: after applying, confirm via a disposable script that a `RunBlock` can now have two `Proof` rows (insert two, both succeed), and confirm all EXISTING real `Proof` rows are untouched (same count, same `driveFileId` values, before and after). Clean up any test rows you create.

- [ ] **Step 4: Type-check, commit**

Run `npx tsc --noEmit` (expect NEW errors in every file using the singular `.proof` accessor — this is expected, Task 2/3's job to fix; confirm the errors are exactly where your Step 2 enumeration said they'd be, nothing unexpected). Commit (including the regenerated Prisma client, per this module's established convention):

```bash
git add prisma/task-manager/schema.prisma prisma/task-manager/migrations/ src/generated/task-manager-client
git commit -m "feat(task-manager): allow multiple Proof rows per task (schema)"
```

---

## Task 2: Data layer — append-based upload, new remove action, updated queries

**Files:**
- Modify: `src/task-manager/data/tasks.ts` (`uploadFlowTaskProof`, add `removeFlowTaskProof`)
- Modify: `src/task-manager/analytics/_lib.ts` (`TaskRow.proofId` → `proofIds`, `PeriodBlock.proof` → `proofs`, the Prisma query, `toTaskRow()`)
- Modify: `src/task-manager/ui/types.ts` (`FlowTaskRow.proofId` → `proofIds`, add `ProofRemoveResult`/`ProofRemoveHandler` types)

- [ ] **Step 1: Read `uploadFlowTaskProof` and its schema/validation in full**

Read `src/task-manager/data/tasks.ts`'s current `uploadFlowTaskProof` (the upsert-and-delete-old version) and `proofImageSchema`/`PROOF_IMAGE_MAX_BASE64` in full before changing anything.

- [ ] **Step 2: Change `uploadFlowTaskProof` from upsert-replace to append-with-cap**

```ts
const MAX_PROOFS_PER_TASK = 5;

export function uploadFlowTaskProof(
  actorEmail: string,
  runBlockId: string,
  image: { mime: string; dataBase64: string },
): Promise<{ proofId: string }> {
  return native(async () => {
    const id = z.string().min(1).parse(runBlockId);
    const img = proofImageSchema.parse(image);
    const user = await requireUserByEmail(actorEmail);

    const runBlock = await prisma.runBlock.findUnique({
      where: { id },
      select: { assigneeId: true, title: true, cadence: true, dueAt: true },
    });
    if (!runBlock) throw new ApiHttpError(404, "Task not found");
    if (runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only upload proof for your own tasks");
    }
    if (runBlock.cadence === "DAILY" && isPastDueDay(runBlock.dueAt)) {
      throw new ApiHttpError(400, "This task's day has passed and can no longer accept proof");
    }

    const existingCount = await prisma.proof.count({ where: { runBlockId: id } });
    if (existingCount >= MAX_PROOFS_PER_TASK) {
      throw new ApiHttpError(400, `You can attach at most ${MAX_PROOFS_PER_TASK} photos to this task`);
    }

    const orgUnit = user.department ?? user.branch ?? "Unassigned";
    const now = new Date();
    const folderPath = [
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      orgUnit,
    ];
    const prefix = sanitizeDriveNamePart(`${user.name}-${runBlock.title}`).slice(0, 150);

    const buffer = Buffer.from(img.dataBase64, "base64");
    const file = new File([buffer], `proof${PROOF_IMAGE_EXT[img.mime] ?? ""}`, { type: img.mime });
    const uploaded = await uploadToDrive(file, {
      prefix,
      folderPath,
      folderEnvVar: "GOOGLE_DRIVE_TASK_PROOF_FOLDER_ID",
    });

    const proof = await prisma.proof.create({
      data: { runBlockId: id, driveFileId: uploaded.id },
    });

    return { proofId: proof.id };
  }, "uploadFlowTaskProof");
}
```

Note what's REMOVED relative to the old version: the `prisma.proof.findUnique({ where: { runBlockId: id } })` existing-row lookup, the `upsert`, and the `deleteFromDrive(existing.driveFileId)` call — none of those belong in the append path anymore. Update the function's doc comment to describe append-with-cap instead of replace.

- [ ] **Step 3: Add `removeFlowTaskProof`**

```ts
export function removeFlowTaskProof(
  actorEmail: string,
  proofId: string,
): Promise<{ ok: true }> {
  return native(async () => {
    const id = z.string().min(1).parse(proofId);
    const user = await requireUserByEmail(actorEmail);

    const proof = await prisma.proof.findUnique({
      where: { id },
      select: {
        driveFileId: true,
        runBlock: { select: { assigneeId: true, cadence: true, dueAt: true } },
      },
    });
    if (!proof) throw new ApiHttpError(404, "Proof not found");
    if (proof.runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only remove proof from your own tasks");
    }
    if (proof.runBlock.cadence === "DAILY" && isPastDueDay(proof.runBlock.dueAt)) {
      throw new ApiHttpError(400, "This task's day has passed and can no longer be changed");
    }

    await prisma.proof.delete({ where: { id } });
    if (proof.driveFileId) {
      await deleteFromDrive(proof.driveFileId);
    }

    return { ok: true };
  }, "removeFlowTaskProof");
}
```

Delete the DB row BEFORE trashing the Drive file (matching the ordering already implicit in the old replace-path's error tolerance — if Drive delete fails after the DB row is gone, the file is orphaned-but-harmless in Drive rather than the DB pointing at a file that's gone; document this ordering choice in the doc comment, mirroring how `template-groups.ts`'s multi-step-write trade-offs are documented elsewhere in this codebase).

Add both functions to the `@/task-manager/data` barrel (`src/task-manager/data.ts`) if `uploadFlowTaskProof` isn't already re-exported from a file that's barrel-exported (check — it likely already is, since it's an existing function; `removeFlowTaskProof` needs the same treatment).

- [ ] **Step 4: Update `_lib.ts`'s query and DTO shape**

In `src/task-manager/analytics/_lib.ts`: change `TaskRow.proofId: string | null` to `TaskRow.proofIds: string[]`, change `PeriodBlock.proof: { id: string } | null` to `PeriodBlock.proofs: { id: string }[]`, update the Prisma query's `select`/`include` from `proof: { select: { id: true } }` to `proofs: { select: { id: true }, orderBy: { createdAt: "asc" } }` (oldest-first, matching upload order), and update `toTaskRow()`'s `proofId: b.proof?.id ?? null,` to `proofIds: b.proofs.map((p) => p.id),`.

- [ ] **Step 5: Update `ui/types.ts`**

`FlowTaskRow.proofId?: string | null;` → `FlowTaskRow.proofIds: string[];` (drop the optionality — an empty array is the "no proof" case now, no need for `undefined`/`null`/`[]` three-way ambiguity). Add:
```ts
export type ProofRemoveResult = { ok: true } | { ok: false; message: string };
export type ProofRemoveHandler = (proofId: string) => Promise<ProofRemoveResult>;
```
`ProofUploadResult`/`ProofUploadHandler` stay as-is (singular) — each upload call still adds exactly one photo at a time, per design decision #5.

- [ ] **Step 6: Live-DB + live-Drive verification**

This is the first task in this whole session's work to touch REAL Google Drive uploads/deletes as part of its own verification (not just Postgres). Using a throwaway RunBlock (or a real one you own and can safely clean up) and tiny real dummy JPEG bytes (a few KB, not a real photo):
1. Upload 3 photos in a row to the same task via `uploadFlowTaskProof` — confirm 3 distinct `Proof` rows exist, each with a distinct `driveFileId`, and confirm via `streamFromDrive` (or the Drive API directly) that all 3 files genuinely exist in Drive.
2. Attempt a 6th upload after uploading 5 total — confirm it's rejected with the cap error, and confirm exactly 5 `Proof` rows exist (the 6th attempt didn't create a row or upload to Drive).
3. Call `removeFlowTaskProof` on the MIDDLE one of the 3 (or 5) uploaded — confirm that specific row is gone, confirm the other rows are completely untouched (same ids, same `driveFileId`s), and confirm the removed one's Drive file is now trashed (not still live).
4. Confirm the ownership/past-due guards still work on both functions (a non-owner gets 403 on both upload and remove).
5. **Clean up everything you created** — delete all test `Proof` rows and trash all test Drive files uploaded during this verification (not just the ones the remove-test already handled) before finishing. This is a shared database AND a shared real Google Drive folder — leftover test images in the actual `GOOGLE_DRIVE_TASK_PROOF_FOLDER_ID` folder are a real, visible mess for whoever looks at that Drive folder later, not just a DB row.

- [ ] **Step 7: Type-check, test, build**

Run `npx tsc --noEmit` — the errors Task 1 introduced in `bits.tsx`/`task-manager-view.tsx`/`department-overview.tsx` (UI files, Task 3's scope) are expected to still be present; confirm `tasks.ts`/`_lib.ts`/`ui/types.ts` themselves are now clean. Run `npm test`, `npm run build`.

- [ ] **Step 8: Commit**

```bash
git add src/task-manager/data/tasks.ts src/task-manager/data.ts src/task-manager/analytics/_lib.ts src/task-manager/ui/types.ts
git commit -m "feat(task-manager): append-based proof upload with 5-photo cap, add remove action"
```

---

## Task 3: UI — gallery of thumbnails, individually removable, fixed camera/gallery picker

**Files:**
- Modify: `src/task-manager/ui/bits.tsx` (`ProofCell` and its call site at line ~2474)
- Modify: `src/task-manager/ui/task-manager-view.tsx` (prop plumbing for the new remove handler)
- Modify: `src/app/task-manager/page.tsx` and any other page defining the `"use server"` action closures that wire `onUploadProof`/need a new `onRemoveProof` closure (grep for where `uploadFlowTaskProof`'s action closure is currently defined — likely `src/app/task-manager/page.tsx`, possibly also `src/app/home/...` if the shared "My Tasks" table is reused there per `department-overview.tsx`'s own comment about reuse — check both)

**Context:** Read the CURRENT full `ProofCell` component in `bits.tsx` before touching it (lines ~616-1082 per earlier research, may have shifted). This is the biggest, most delicate rewrite in this plan — read it end-to-end first, understand every existing entry point (drag-drop, clipboard paste, the two file inputs, the desktop `getUserMedia` webcam flow, the review-before-submit staging step, the viewer modal) before changing anything, so nothing is silently dropped.

- [ ] **Step 1: Fix the camera-forcing input (small, do this first and independently)**

Find the `cameraRef` input (`accept="image/*" capture="environment"`) and remove the `capture="environment"` attribute. Confirm `openCamera()`'s mobile-detection branch still makes sense afterward — it currently does `cameraRef.current?.click()` on mobile vs. opening the in-page `getUserMedia` webcam preview on desktop; with `capture` removed, mobile tapping "📷 Take Photo" now opens the OS's normal camera-or-gallery chooser (same as "📁 Upload File" would) rather than jumping straight into the camera app — confirm this is genuinely the only change needed here (per design decision #6, keep both buttons, just fix the forcing — do not restructure `openCamera()`'s branching logic beyond removing the one attribute, unless something concrete breaks that requires it).

- [ ] **Step 2: Redesign `ProofCell`'s state from single-value to list-based**

Replace `pendingImage: {...} | null` and `localProofId: string | null` with something like:
```ts
const [proofIds, setProofIds] = React.useState<string[]>(task.proofIds);
const [uploading, setUploading] = React.useState(false);
const [error, setError] = React.useState<string | null>(null);
```
Every "add a photo" entry point (file picker `onFile`, drag-drop, clipboard paste, camera capture, desktop webcam `capturePhoto()`) still runs the SAME compress-then-upload pipeline per photo (reuse `compressImageFile` from `image-compress.ts` completely unchanged), but instead of staging into a single `pendingImage` awaiting a manual "Upload" click, each pick immediately compresses and calls `onUploadProof` (matching design decision #5 — no staged/batch step), appending the returned `proofId` to the local `proofIds` list on success. Disable further adds while `uploading` is true, and while already at `MAX_PROOFS_PER_TASK` (5) — surface a clear "5/5 photos attached" state rather than silently doing nothing when the cap is hit.

Consider whether the existing "review before submit" UX step (mentioned in earlier research as part of the current flow) should be kept per-photo (pick → preview → confirm → upload) or simplified to pick-and-upload-immediately given design decision #5 explicitly rules out staged/batch semantics — re-read the CURRENT component to judge whether the existing preview step is trivial to keep (low risk, familiar UX, users already know it) or whether it meaningfully complicates the new list-based model; lean toward keeping it if it's a clean, isolated adaptation, drop it only if keeping it would require reintroducing real batch-state complexity the plan is trying to avoid.

- [ ] **Step 3: Build the gallery + remove UI**

Render `proofIds` as a row/grid of small thumbnails (each `<img src={\`/api/task-manager/proof-image/${id}\`}>`, no `?v=` cache-buster needed anymore since each photo now has its own permanent id rather than a mutable one — confirm this is correct: the OLD cache-busting existed specifically because a re-upload REPLACED the file under the same id, which no longer happens). Each thumbnail gets a small remove control (× overlay, or reveal-on-hover, matching this component's existing icon-button conventions) that calls the new `onRemoveProof(proofId)` handler and removes that id from local state on success, showing an inline error (reusing the existing `ErrorLine`-style pattern already used elsewhere in this Task Manager UI, e.g. `branch-package-schedule-grid.tsx`'s own `ErrorLine`) on failure without discarding the rest of the gallery.

Clicking a thumbnail should still open SOME kind of enlarged view (the existing single-image viewer modal, adapted to show whichever photo was clicked, ideally with next/prev navigation between the task's photos if that's a clean addition — but a simpler "just show this one photo enlarged, with its own Remove button" is an acceptable, smaller-scope version if next/prev navigation adds meaningfully more complexity; use judgment, note the choice made).

- [ ] **Step 4: Update the call site gating and prop plumbing**

`bits.tsx`'s row-list gating check (`{(t.proofId || (isOwned && onUploadProof)) && (<ProofCell .../>)}`) becomes `{(t.proofIds.length > 0 || (isOwned && onUploadProof)) && (<ProofCell .../>)}`. `ProofCell` needs a new `onRemoveProof: ProofRemoveHandler` prop threaded through the same chain `onUploadProof` already flows through — `task-manager-view.tsx` and wherever else the shared table component is rendered (check `department-overview.tsx`'s reuse, per the research). Find where the page-level `"use server"` closure for `uploadFlowTaskProof` is currently defined (likely alongside `assignFlowTask`'s own closures in `src/app/task-manager/page.tsx`) and add a matching `removeProof` closure calling `removeFlowTaskProof`, following this codebase's established action-closure pattern exactly (`requireLiveSession` check, try/catch, `FlowBridgeError`-aware message extraction) — read an existing closure in that same file for the precise shape to copy.

- [ ] **Step 5: Type-check, build**

Run `npx tsc --noEmit` (should now be fully clean, no remaining `.proof`/`proofId` singular-shape errors anywhere), `npm run build`.

- [ ] **Step 6: Verification**

No browser automation available. Compensate with careful code tracing (upload flow: pick → compress → upload → append to list → render new thumbnail; remove flow: click × → call handler → remove from list on success → error stays visible on failure without losing other photos) plus a live-DB+Drive check that a real multi-photo `task.proofIds` array, once populated via Task 2's verification, renders the exact shape this component expects (same "confirm exact field names line up" discipline used throughout this session).

- [ ] **Step 7: Commit**

```bash
git add src/task-manager/ui/bits.tsx src/task-manager/ui/task-manager-view.tsx src/app/task-manager/page.tsx
# (plus department-overview.tsx / any other file touched for prop plumbing)
git commit -m "feat(task-manager): proof gallery UI with per-photo remove, fix camera-forces-only-camera"
```

---

## Task 4: Final holistic review

Not a code task — dispatch a final review agent across the whole `feat/proof-multi-photo` branch before `finishing-a-development-branch`. Specifically re-verify on the FINAL merged diff:
1. Full upload/cap/remove flow, fresh, end-to-end through the REAL page/server-action path (not just the data-layer functions directly) — including a real (tiny dummy) Google Drive upload and removal, cleaned up afterward.
2. The camera-forcing fix — confirm `capture="environment"` is genuinely gone and nothing else in `openCamera()`'s mobile/desktop branching broke.
3. Confirm `src/lib/drive.ts` and the proxy route (`/api/task-manager/proof-image/[id]/route.ts`) are byte-for-byte untouched, per design decision #7.
4. Confirm EXISTING real `Proof` rows (from before this branch) still resolve correctly through the new array-shaped UI — a task that already had exactly one proof photo before this feature shipped should show up as a 1-photo gallery, not break or disappear.
5. Full test suite + build clean.
6. Confirm no leftover test images anywhere in the real `GOOGLE_DRIVE_TASK_PROOF_FOLDER_ID` Drive folder from ANY task's verification work in this whole plan (Task 2 and Task 4 both do live Drive uploads — do a final sweep, not just trust each task's own individual cleanup claim).
