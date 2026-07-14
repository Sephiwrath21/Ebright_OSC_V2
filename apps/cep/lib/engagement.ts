import { prisma } from './prisma';

export interface EngagementFilters {
  branch?: string;
  program?: string;
  days?: number;
}

/**
 * Parents who have received at least one email ever, but have no open/click
 * in the trailing `days` (default 30). Mirrors the raw SQL that previously
 * lived inline in app/automation/cron/page.tsx.
 */
export async function getAtRiskCount(filters: EngagementFilters = {}): Promise<number> {
  const branch = filters.branch ?? 'all';
  const program = filters.program ?? 'all';
  const since = new Date();
  since.setDate(since.getDate() - (filters.days ?? 30));

  const result: Array<{ count: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT p.id) as count
    FROM Parent p
    JOIN EbrightCepBranch b ON b.id = p.branchId
    WHERE
      (b.name = ${branch} OR ${branch} = 'all') AND
      (p.program = ${program} OR ${program} = 'all') AND
      p.id IN (
        SELECT DISTINCT parentId FROM SendLog WHERE status IN ('SENT', 'DELIVERED', 'OPENED', 'CLICKED')
      ) AND p.id NOT IN (
        SELECT DISTINCT parentId FROM SendLog WHERE openedAt >= ${since} OR clickedAt >= ${since}
      )
  `;
  return result.length > 0 ? Number(result[0].count) : 0;
}

/** Share of delivered-or-better sends (trailing `days`) that were opened or clicked. */
export async function getEngagementRate(filters: EngagementFilters = {}): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - (filters.days ?? 30));

  const parentWhere = {
    ...(filters.branch && filters.branch !== 'all' ? { branch: { name: filters.branch } } : {}),
    ...(filters.program && filters.program !== 'all' ? { program: filters.program } : {}),
  };
  const sendLogWhere = { sentAt: { gte: since }, parent: parentWhere };

  const [deliveredCount, engagedCount] = await Promise.all([
    prisma.sendLog.count({ where: { ...sendLogWhere, status: { in: ['DELIVERED', 'OPENED', 'CLICKED'] } } }),
    prisma.sendLog.count({ where: { ...sendLogWhere, OR: [{ openedAt: { not: null } }, { clickedAt: { not: null } }] } }),
  ]);

  return deliveredCount > 0 ? (engagedCount / deliveredCount) * 100 : 0;
}
