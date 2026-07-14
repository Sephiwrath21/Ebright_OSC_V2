/**
 * ============================================================================
 * SERVERLESS CAVEAT
 * ============================================================================
 * The in-process scheduler below (registerAutoBlastScheduler + node-cron) only
 * works while the Node process runs continuously — i.e. `npm run dev` or
 * `npm run start` on a long-lived server (VPS, Docker container, etc).
 *
 * If this app is later deployed to a serverless platform like Vercel, each
 * request runs in an isolated short-lived function and there is no long-running
 * process to hold the setInterval alive. In that case:
 *   - Remove or no-op the scheduler in `instrumentation.ts`
 *   - Configure an external scheduler (Vercel Cron Jobs, GitHub Actions,
 *     Upstash QStash, an always-on worker, etc.) to hit
 *       POST /api/autoblast/run
 *     on a fixed interval (e.g. every minute).
 *   - `checkAndRunAutoBlasts()` below is deliberately self-contained so it
 *     can be triggered either from the in-process scheduler OR from an
 *     external HTTP call.
 * ============================================================================
 */

import { prisma } from './prisma';
import { fireBlastSend, withBranchName } from './send';
import { createNotification } from './notifications';

export interface AutoBlastRunResult {
  jobsChecked: number;
  jobsFired: number;
  totalRecipients: number;
  emailsSent: number;
  emailsFailed: number;
  jobs: Array<{
    jobId: string;
    jobName: string;
    contentId: string;
    recipients: number;
    nextRunAt: string;
  }>;
}

/**
 * Called on a timer (in dev) or by external cron (in prod).
 * Finds active jobs where nextRunAt <= now, fires them, updates schedules.
 */
export async function checkAndRunAutoBlasts(): Promise<AutoBlastRunResult> {
  const now = new Date();

  const dueJobs = await prisma.autoBlastJob.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now },
    },
    include: { content: true },
  });

  const result: AutoBlastRunResult = {
    jobsChecked: dueJobs.length,
    jobsFired: 0,
    totalRecipients: 0,
    emailsSent: 0,
    emailsFailed: 0,
    jobs: [],
  };

  for (const job of dueJobs) {
    if (!job.content || !job.content.isActive) {
      // content deleted or deactivated — pause this job by pushing nextRunAt forward
      await prisma.autoBlastJob.update({
        where: { id: job.id },
        data: {
          lastRunAt: now,
          nextRunAt: new Date(now.getTime() + job.intervalMinutes * 60_000),
        },
      });
      continue;
    }

    // Resolve segment
    const where: Record<string, unknown> = {};
    if (job.segmentBranch && job.segmentBranch !== 'all') where.branch = { name: job.segmentBranch };
    if (job.segmentStatus && job.segmentStatus !== 'all') where.status = job.segmentStatus;
    const parents = (await prisma.parent.findMany({ where, include: { branch: true } })).map(withBranchName);

    let sent = 0;
    let failed = 0;

    for (const parent of parents) {
      try {
        const r = await fireBlastSend(
          parent,
          {
            id: job.content.id,
            title: job.content.title,
            channel: job.content.channel,
            body: job.content.body,
            link: job.content.link,
          },
          { triggeredBy: 'autoblast', reason: `AutoBlast: ${job.name}` },
        );
        if (r.emailAttempted) {
          if (r.emailSent) sent++;
          else failed++;
        } else {
          // SMS/WA-only or email not configured — still counts as a send from the job's PoV
          sent++;
        }
      } catch (err) {
        failed++;
        console.error(`AutoBlast job ${job.name} -> ${parent.email}:`, err);
      }
    }

    const nextRunAt = new Date(now.getTime() + job.intervalMinutes * 60_000);
    await prisma.autoBlastJob.update({
      where: { id: job.id },
      data: { lastRunAt: now, nextRunAt },
    });

    result.jobsFired++;
    result.totalRecipients += parents.length;
    result.emailsSent += sent;
    result.emailsFailed += failed;
    result.jobs.push({
      jobId: job.id,
      jobName: job.name,
      contentId: job.contentId,
      recipients: parents.length,
      nextRunAt: nextRunAt.toISOString(),
    });

    await createNotification({
      type: 'blast_sent',
      title: `Auto-blast: ${job.name}`,
      message: `Fired to ${parents.length} parents · next in ${job.intervalMinutes}m`,
    });
  }

  return result;
}

// -----------------------------------------------------------------------------
// In-process scheduler (long-running dev/self-hosted only)
// -----------------------------------------------------------------------------

// Guard against duplicate registration across Next.js dev hot-reloads.
declare global {
  // eslint-disable-next-line no-var
  var __ebrightAutoBlastRegistered__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __ebrightAutoBlastTask__: { stop?: () => void } | undefined;
}

/**
 * Register a node-cron task that calls checkAndRunAutoBlasts() every minute.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function registerAutoBlastScheduler(): Promise<void> {
  if (globalThis.__ebrightAutoBlastRegistered__) {
    return;
  }
  globalThis.__ebrightAutoBlastRegistered__ = true;

  // Dynamic import so this file stays importable in edge / build contexts
  // where node-cron might not resolve.
  const cron = await import('node-cron');

  console.log('[autoblast] registering in-process scheduler (every 60s)');
  const task = cron.schedule('* * * * *', async () => {
    try {
      const r = await checkAndRunAutoBlasts();
      if (r.jobsFired > 0) {
        console.log(
          `[autoblast] fired ${r.jobsFired} job(s), ${r.totalRecipients} recipients ` +
            `(email sent: ${r.emailsSent}, failed: ${r.emailsFailed})`,
        );
      }
    } catch (err) {
      console.error('[autoblast] scheduler tick failed:', err);
    }
  });

  globalThis.__ebrightAutoBlastTask__ = task;
}
