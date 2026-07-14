/**
 * Real, server-side scheduler for the day-based automation engine (lib/cron.ts).
 * Mirrors the pattern in lib/autoblast.ts — see the SERVERLESS CAVEAT comment
 * there: this only works on a long-lived Node process (npm run dev / start on
 * a VPS or container), not on serverless platforms.
 *
 * Ticks every 60s regardless of the flag, but only calls runCron() when
 * AutomationSettings.cronEnabled is true — this is the actual Start/Stop
 * kill switch. Flipping it off via /api/admin/cron-settings takes effect on
 * the very next tick, no redeploy or restart needed.
 *
 * This file is the convergence point for two of the app's three notification
 * layers — see docs/architecture.md for the full picture:
 *   1. Conveyer belt (per-parent lifecycle)  — runCron()'s main per-parent loop
 *   2. Monthly ad-hoc (shared, Cal.com-driven) — the sync block below
 *   3. Promo (manual/on-demand)              — NOT here; /promo triggers
 *      fireBlastSend() directly on click, no scheduler involvement at all.
 */
import { runCron } from './cron';
import { getCronEnabled, isCalcomSyncDue, touchCalcomSyncedAt } from './cronSettings';
import { syncFestiveCalendar } from './festiveSync';
import { syncShowcaseEvents } from './showcaseSync';

declare global {
  // eslint-disable-next-line no-var
  var __ebrightCronRegistered__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __ebrightCronTask__: { stop?: () => void } | undefined;
}

export async function registerCronScheduler(): Promise<void> {
  if (globalThis.__ebrightCronRegistered__) {
    return;
  }
  globalThis.__ebrightCronRegistered__ = true;

  const cron = await import('node-cron');

  console.log('[cron] registering in-process day-based automation scheduler (every 60s)');
  const task = cron.schedule('* * * * *', async () => {
    // Cal.com sync (festivals + showcases) — runs on its own ~daily cadence regardless
    // of the Start/Stop flag below (syncing dates isn't a send, so the kill switch
    // shouldn't block admins from seeing fresh dates while paused).
    try {
      if (await isCalcomSyncDue()) {
        const [festiveResult, showcaseResult] = await Promise.all([syncFestiveCalendar(), syncShowcaseEvents()]);
        if (festiveResult.ranSync || showcaseResult.ranSync) {
          await touchCalcomSyncedAt();
        }
        if (festiveResult.synced > 0 || festiveResult.canceled > 0) {
          console.log(`[cron] festive sync: ${festiveResult.synced} synced, ${festiveResult.canceled} canceled`);
        }
        if (showcaseResult.synced > 0 || showcaseResult.canceled > 0) {
          console.log(`[cron] showcase sync: ${showcaseResult.synced} synced, ${showcaseResult.canceled} canceled`);
        }
      }
    } catch (err) {
      console.error('[cron] Cal.com sync failed:', err);
    }

    try {
      const enabled = await getCronEnabled();
      if (!enabled) return;

      const result = await runCron();
      if (Object.keys(result.counts).length > 0) {
        console.log(`[cron] ${result.summary}`);
      }
    } catch (err) {
      console.error('[cron] scheduler tick failed:', err);
    }
  });

  globalThis.__ebrightCronTask__ = task;
}
