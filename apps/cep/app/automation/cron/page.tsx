import { prisma } from '@/lib/prisma';
import { addMonths, differenceInDays, startOfDay, startOfISOWeek } from 'date-fns';
import { CronMonitorView, type CronMonitorViewProps } from './CronMonitorView';
import { getPlanDurationMonths } from '../../../lib/plans';
import { getAtRiskCount, getEngagementRate } from '@/lib/engagement';
import { getCronEnabled, getNextTickAt } from '@/lib/cronSettings';

export const dynamic = 'force-dynamic';

export default async function CronMonitorPage({
  searchParams,
}: {
  searchParams: { branch?: string; program?: string };
}) {
  const selectedBranch = searchParams.branch || 'all';
  const selectedProgram = searchParams.program || 'all';

  // Get the last 20 cron sends to represent "recent runs" for the stat card.
  const logs = await prisma.sendLog.findMany({
    where: { triggeredBy: 'cron' },
    orderBy: { createdAt: 'desc' },
    select: { id: true }, // only fetch id for counting
    take: 20,
  });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Base WHERE clause for filtering by branch and program
  const parentWhere = {
    ...(selectedBranch !== 'all' && { branch: { name: selectedBranch } }),
    ...(selectedProgram !== 'all' && { program: selectedProgram }),
  };

  const sendLogWhere = {
    sentAt: { gte: thirtyDaysAgo },
    parent: parentWhere,
  };

  // Calculate totals from SendLog for filterability
  const sendCounts = await prisma.sendLog.groupBy({
    by: ['contentType'],
    _count: { _all: true },
    where: {
      ...sendLogWhere,
      status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] },
    },
  });

  const totals = {
    runs: logs.length,
    followus: sendCounts.find((c) => c.contentType === 'followus_reminder')?._count._all ?? 0,
    review: sendCounts.find((c) => c.contentType === 'review')?._count._all ?? 0,
    referral: sendCounts.find((c) => c.contentType === 'referral')?._count._all ?? 0,
    renewal: sendCounts
      .filter((c) => c.contentType.startsWith('renewal'))
      .reduce((sum, current) => sum + current._count._all, 0),
    birthday: sendCounts.find((c) => c.contentType === 'birthday')?._count._all ?? 0,
    video: sendCounts.find((c) => c.contentType === 'video')?._count._all ?? 0,
    festive: sendCounts
      .filter((c) => c.contentType.startsWith('festive'))
      .reduce((sum, current) => sum + current._count._all, 0),
  };

  // Calculate Engagement Rate
  const engagementRate = await getEngagementRate({ branch: selectedBranch, program: selectedProgram });

  // Get unique branches and programs for filters
  const [branches, programs] = await Promise.all([
    prisma.ebrightCepBranch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }).then((rows) => rows.map((r) => r.name)),
    prisma.parent.findMany({ select: { program: true }, distinct: ['program'] }).then(res => res.map(r => r.program).sort())
  ]);

  // Fetch last 20 individual sends for the activity feed
  const activityLogs = await prisma.sendLog.findMany({
    where: { triggeredBy: 'cron' },
    select: { id: true, createdAt: true, contentType: true, status: true, parent: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // 1. Fetch automation rule triggers from the database
  const automationRuleTriggers = await prisma.automationRuleTrigger.findMany({
    include: { rule: true },
  });

  // Active festive events whose on-day (or 2nd day) falls today — mirrors birthdayToday below.
  const activeFestiveEvents = await prisma.festiveEvent.findMany({ where: { isActive: true, sendOnDay: true } });
  const isFestiveToday = (branch: string) =>
    activeFestiveEvents.some((evt) => {
      if (evt.branch && evt.branch !== branch) return false;
      const dates = [evt.date, evt.endDate].filter((d): d is Date => d != null);
      return dates.some((d) => new Date(d).getDate() === now.getDate() && new Date(d).getMonth() === now.getMonth());
    });

  // 2. Create lookup maps for rules relative to enrollment start and plan end
  const startRulesMap = new Map<string, Map<string, number>>();
  const endRulesMap = new Map<string, Map<string, number[]>>();

  for (const trigger of automationRuleTriggers) {
    if (trigger.triggerRelativeTo === 'start') {
      if (!startRulesMap.has(trigger.rule.name)) {
        startRulesMap.set(trigger.rule.name, new Map());
      }
      startRulesMap.get(trigger.rule.name)!.set(trigger.planType, trigger.triggerDay);
    } else { // 'end'
      if (!endRulesMap.has(trigger.rule.name)) {
        endRulesMap.set(trigger.rule.name, new Map());
      }
      const planMap = endRulesMap.get(trigger.rule.name)!;
      if (!planMap.has(trigger.planType)) {
        planMap.set(trigger.planType, []);
      }
      planMap.get(trigger.planType)!.push(trigger.triggerDay);
    }
  }

  // Sort the end-relative trigger days so we can find the next one easily
  for (const planMap of endRulesMap.values()) {
    for (const days of planMap.values()) {
      days.sort((a, b) => a - b); // Sort ascending, e.g. [3, 14, 30]
    }
  }

  const getStartTriggerDay = (ruleName: string, planType: string | null): number => {
    if (!planType) return Infinity;
    return startRulesMap.get(ruleName)?.get(planType) ?? Infinity;
  };

  const getEndTriggerDays = (ruleName: string, planType: string | null): number[] => {
    if (!planType) return [];
    return endRulesMap.get(ruleName)?.get(planType) ?? [];
  };

  // 3. Calculate At-Risk Parents, respecting filters
  const atRiskCount = await getAtRiskCount({ branch: selectedBranch, program: selectedProgram });

  const parentRows = await prisma.parent.findMany({
    where: { status: { in: ['active', 'trial'] }, ...parentWhere },
    orderBy: { name: 'asc' },
    include: { branch: true },
  });

  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfISOWeek(now);

  const parentStatuses: CronMonitorViewProps['parentStatuses'] = await Promise.all(
    parentRows.map(async (p) => {
      const daysSinceEnroll = differenceInDays(todayStart, startOfDay(p.enrollDate));

      const [followupSent, reviewSent, referralSent, renewalSent, videoSentThisWeek] = await Promise.all([
        prisma.sendLog.findFirst({ where: { parentId: p.id, contentType: 'followus_reminder', status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] } } }),
        prisma.sendLog.findFirst({ where: { parentId: p.id, contentType: 'review', status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] } } }),
        prisma.sendLog.findFirst({ where: { parentId: p.id, contentType: 'referral', status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] } } }),
        prisma.sendLog.findFirst({ where: { parentId: p.id, contentType: { startsWith: 'renewal' }, status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] } } }),
        prisma.sendLog.findFirst({
          where: { parentId: p.id, contentType: 'video', status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] }, sentAt: { gte: weekStart } },
        }),
      ]);

      // Refactored logic to use dynamic rules based on plan_type
      const followupDueDay = getStartTriggerDay('followus_reminder', p.plan_type);
      const reviewDueDay = getStartTriggerDay('review', p.plan_type);
      const referralDueDay = getStartTriggerDay('referral', p.plan_type);

      const followup: 'sent' | 'due' | 'upcoming' = followupSent ? 'sent' : daysSinceEnroll >= followupDueDay ? 'due' : 'upcoming';
      const review: 'sent' | 'due' | 'upcoming' = reviewSent ? 'sent' : daysSinceEnroll >= reviewDueDay ? 'due' : 'upcoming';
      const referral: 'sent' | 'due' | 'upcoming' = referralSent ? 'sent' : daysSinceEnroll >= referralDueDay ? 'due' : 'upcoming';

      let renewal: 'sent' | 'due' | 'upcoming' | 'disabled' = 'disabled';
      const planMonths = getPlanDurationMonths(p.plan_type);
      if (planMonths > 0) {
        if (renewalSent) {
          renewal = 'sent';
        } else {
          const expiryDate = addMonths(startOfDay(p.enrollDate), planMonths);
          const daysUntilExpiry = differenceInDays(expiryDate, todayStart);

          const renewalTriggerDays = getEndTriggerDays('renewal', p.plan_type);
          const isDue = renewalTriggerDays.some((day) => daysUntilExpiry >= 0 && daysUntilExpiry <= day);

          if (isDue) {
            renewal = 'due';
          } else {
            renewal = 'upcoming';
          }
        }
      }

      const video: 'sent' | 'pending' = videoSentThisWeek ? 'sent' : 'pending';
      const birthdayToday = p.birthday
        ? new Date(p.birthday).getDate() === now.getDate() && new Date(p.birthday).getMonth() === now.getMonth()
        : false;
      const festiveToday = isFestiveToday(p.branch.name);

      return {
        id: p.id,
        name: p.name,
        studentName: p.studentName,
        branch: p.branch.name,
        daysSinceEnroll,
        plan_type: p.plan_type ?? 'N/A',
        followup,
        review,
        referral,
        renewal,
        video,
        birthdayToday,
        festiveToday,
      };
    }),
  );

  const jobRows = await prisma.autoBlastJob.findMany({
    include: { content: true },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  });

  const jobs: CronMonitorViewProps['jobs'] = jobRows.map((j) => ({
    id: j.id,
    name: j.name,
    channel: j.content?.channel ?? 'EMAIL',
    segmentBranch: j.segmentBranch ?? 'all',
    segmentStatus: j.segmentStatus ?? 'all',
    intervalMinutes: j.intervalMinutes,
    isActive: j.isActive,
    nextRunAt: j.nextRunAt,
  }));

  const activityRows: CronMonitorViewProps['activityRows'] = activityLogs.map((l) => ({
    id: l.id,
    timestamp: l.createdAt,
    parentName: l.parent.name,
    contentType: l.contentType,
    status: l.status,
  }));

  const cronEnabled = await getCronEnabled();
  const nextTickAt = getNextTickAt().toISOString();

  return (
    <CronMonitorView
      totals={{ ...totals, atRisk: atRiskCount, engagementRate }}
      activityRows={activityRows}
      parentStatuses={parentStatuses}
      jobs={jobs}
      cronEnabled={cronEnabled}
      nextTickAt={nextTickAt}
      filterOptions={{ branches, programs }}
      currentFilters={{ branch: selectedBranch, program: selectedProgram }}
    />
  );
}