import { prisma } from '@/lib/prisma';
import { startOfDay } from 'date-fns';
import Link from 'next/link';
import { RuleCardsGrid, type RuleCardItem } from './RuleCardsGrid';

export const dynamic = 'force-dynamic';

// Cosmetic only — a rule with no entry here just gets the default icon/color.
const RULE_DISPLAY: Record<string, { label: string; icon: string; color: string }> = {
  welcome: { label: 'Welcome', icon: '👋', color: '#dc2626' },
  followus: { label: 'Follow us', icon: '📱', color: '#dc2626' },
  followus_reminder: { label: 'Follow us reminder', icon: '🔁', color: '#f59e0b' },
  video: { label: 'Video blast', icon: '🎥', color: '#f59e0b' },
  review: { label: 'Parent review', icon: '⭐', color: '#f59e0b' },
  referral: { label: 'Referral', icon: '🎁', color: '#22c55e' },
  birthday: { label: 'Birthday', icon: '🎂', color: '#f87171' },
  renewal: { label: 'Renewal / expiry reminder', icon: '⏰', color: '#dc2626' },
};

function triggerSummary(triggers: { planType: string; triggerDay: number; triggerRelativeTo: string }[]): string {
  if (triggers.length === 0) return 'No triggers configured';
  const byRel: Record<string, number[]> = {};
  for (const t of triggers) {
    const key = t.triggerRelativeTo;
    byRel[key] = byRel[key] ?? [];
    if (!byRel[key].includes(t.triggerDay)) byRel[key].push(t.triggerDay);
  }
  const parts: string[] = [];
  if (byRel.start) parts.push(`Day ${byRel.start.sort((a, b) => a - b).join('/')} after enrollment`);
  if (byRel.end) parts.push(`${byRel.end.sort((a, b) => b - a).join('/')} days before expiry`);
  return parts.join(' · ');
}

async function getAutomationRuleCards(): Promise<RuleCardItem[]> {
  const rules = await prisma.automationRule.findMany({
    include: { triggers: true },
    orderBy: { name: 'asc' },
  });
  const todayStart = startOfDay(new Date());

  return Promise.all(
    rules.map(async (rule) => {
      // Matches the exact rule name or a sequenced variant (e.g. 'renewal_30d_before_expiry'),
      // but not sibling rules that merely share a prefix (e.g. 'followus' vs 'followus_reminder').
      const contentTypeFilter = { OR: [{ contentType: rule.name }, { contentType: { startsWith: `${rule.name}_` } }] };
      const sentToday = await prisma.sendLog.count({
        where: { ...contentTypeFilter, status: 'SENT', sentAt: { gte: todayStart } },
      });
      const skipped = await prisma.sendLog.count({
        where: { ...contentTypeFilter, status: 'SKIPPED' },
      });
      const last = await prisma.sendLog.findFirst({
        where: { ...contentTypeFilter, status: 'SENT' },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
      });
      return {
        id: rule.id,
        name: rule.name,
        isActive: rule.isActive,
        layer: rule.layer as RuleCardItem['layer'],
        display: RULE_DISPLAY[rule.name] ?? { label: rule.name, icon: '📩', color: '#9ca3af' },
        trigger: triggerSummary(rule.triggers),
        sentToday,
        pending: skipped,
        lastFired: last?.sentAt?.toISOString() ?? null,
      };
    }),
  );
}

// Festive/Showcase aren't AutomationRule rows (see FestiveEvent/ShowcaseEvent,
// docs/architecture.md layer 2) — synthesized here as one summary card each per
// category, tagged layer:'monthly' in code since there's no natural DB column for
// "layer" on a per-festival/per-showcase basis (each card represents the whole
// category, not one row per calendar event).
async function getMonthlyCards(): Promise<RuleCardItem[]> {
  const todayStart = startOfDay(new Date());

  const [festiveActive, festiveSentToday, festiveSkipped, festiveLast, showcaseActive, showcaseSentToday, showcaseSkipped, showcaseLast] =
    await Promise.all([
      prisma.festiveEvent.count({ where: { isActive: true } }),
      prisma.sendLog.count({ where: { contentType: { startsWith: 'festive' }, status: 'SENT', sentAt: { gte: todayStart } } }),
      prisma.sendLog.count({ where: { contentType: { startsWith: 'festive' }, status: 'SKIPPED' } }),
      prisma.sendLog.findFirst({ where: { contentType: { startsWith: 'festive' }, status: 'SENT' }, orderBy: { sentAt: 'desc' }, select: { sentAt: true } }),
      prisma.showcaseEvent.count({ where: { isActive: true } }),
      prisma.sendLog.count({ where: { contentType: { startsWith: 'showcase' }, status: 'SENT', sentAt: { gte: todayStart } } }),
      prisma.sendLog.count({ where: { contentType: { startsWith: 'showcase' }, status: 'SKIPPED' } }),
      prisma.sendLog.findFirst({ where: { contentType: { startsWith: 'showcase' }, status: 'SENT' }, orderBy: { sentAt: 'desc' }, select: { sentAt: true } }),
    ]);

  return [
    {
      id: 'festive',
      name: 'festive',
      isActive: festiveActive > 0,
      layer: 'monthly',
      display: { label: 'Festive', icon: '🎉', color: '#a855f7' },
      trigger: `${festiveActive} active festival${festiveActive === 1 ? '' : 's'} · shared calendar date (Cal.com)`,
      sentToday: festiveSentToday,
      pending: festiveSkipped,
      lastFired: festiveLast?.sentAt?.toISOString() ?? null,
    },
    {
      id: 'showcase',
      name: 'showcase',
      isActive: showcaseActive > 0,
      layer: 'monthly',
      display: { label: 'Showcase', icon: '🎤', color: '#dc2626' },
      trigger: `${showcaseActive} active showcase${showcaseActive === 1 ? '' : 's'} · shared calendar date (Cal.com)`,
      sentToday: showcaseSentToday,
      pending: showcaseSkipped,
      lastFired: showcaseLast?.sentAt?.toISOString() ?? null,
    },
  ];
}

export default async function AutomationPage() {
  const [ruleCards, monthlyCards] = await Promise.all([getAutomationRuleCards(), getMonthlyCards()]);
  const allCards = [...ruleCards, ...monthlyCards];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0, color: '#111827' }}>Automation rules</h1>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 0' }}>
          {allCards.length} rules · Weekly (per-parent) · Monthly (shared calendar) · Promo (manual) — see docs/architecture.md
        </p>
      </div>

      <RuleCardsGrid rules={allCards} />

      <div style={{ marginTop: '16px', fontSize: '12px', color: '#6b7280' }}>
        See the full queue at <Link href="/automation/queue" style={{ color: '#dc2626' }}>/automation/queue</Link> · Configure rules at{' '}
        <Link href="/admin/rules" style={{ color: '#dc2626' }}>/admin/rules</Link> (admin) · Cron log + demo controls under{' '}
        <Link href="/automation/cron" style={{ color: '#dc2626' }}>Admin</Link> · Send Promo from{' '}
        <Link href="/promo" style={{ color: '#dc2626' }}>/promo</Link>
      </div>
    </div>
  );
}
