import { prisma } from './prisma';

const SETTINGS_ID = 'singleton';

/** Real, DB-persisted Start/Stop flag for the day-based automation scheduler (lib/cronScheduler.ts). */
export async function getCronEnabled(): Promise<boolean> {
  const settings = await prisma.automationSettings.findUnique({ where: { id: SETTINGS_ID } });
  return settings?.cronEnabled ?? false;
}

export async function setCronEnabled(enabled: boolean): Promise<boolean> {
  const settings = await prisma.automationSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { cronEnabled: enabled },
    create: { id: SETTINGS_ID, cronEnabled: enabled },
  });
  return settings.cronEnabled;
}

/** Must match the `'* * * * *'` pattern in lib/cronScheduler.ts — node-cron fires that pattern
 * at the top of every minute (wall-clock :00), not N seconds after registration. */
export const TICK_INTERVAL_SECONDS = 60;

/** Next time the real scheduler tick will fire, derived from the cron pattern rather than
 * tracked state — no need to reach into the scheduler's internals to know this. */
export function getNextTickAt(): Date {
  const ms = TICK_INTERVAL_SECONDS * 1000;
  return new Date(Math.ceil(Date.now() / ms) * ms);
}

const CALCOM_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // ~daily

/** True once calcomSyncedAt is missing or more than a day old — checked on every
 * scheduler tick (lib/cronScheduler.ts) rather than registering a second cron job,
 * since a 60s-granularity check against a stored timestamp is effectively free.
 * Gates both the festival sync (lib/festiveSync.ts) and showcase sync
 * (lib/showcaseSync.ts) — one Cal.com account, one sync cadence. */
export async function isCalcomSyncDue(): Promise<boolean> {
  const settings = await prisma.automationSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!settings?.calcomSyncedAt) return true;
  return Date.now() - settings.calcomSyncedAt.getTime() >= CALCOM_SYNC_INTERVAL_MS;
}

export async function touchCalcomSyncedAt(): Promise<void> {
  await prisma.automationSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { calcomSyncedAt: new Date() },
    create: { id: SETTINGS_ID, calcomSyncedAt: new Date() },
  });
}
