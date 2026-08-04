// BullMQ queue contract — shared by the API (producers) and server/workers (consumers).
// Job-id scheme is load-bearing: completion cancels the pending reminder BY ID
// (spec §5: orphaned delayed jobs must be removed, not ignored).

import { Queue } from "bullmq";
import { getRedis } from "./redis";

export const REMINDER_QUEUE = "flow-reminders";

export interface ReminderJobData {
  runBlockId: string;
}

// Deterministic id per (runBlock, strike#): re-queueing after each reminder gets a fresh id,
// and RunBlock.reminderJobId always holds the currently-pending one.
export function reminderJobId(runBlockId: string, strike: number): string {
  return `reminder:${runBlockId}:${strike}`;
}

const globalForQueues = globalThis as unknown as { reminderQueue?: Queue<ReminderJobData> };

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
    globalForQueues.reminderQueue = new Queue<ReminderJobData>(REMINDER_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      },
    });
  }
  return globalForQueues.reminderQueue;
}
