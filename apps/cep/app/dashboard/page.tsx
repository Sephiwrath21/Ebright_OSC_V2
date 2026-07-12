import { prisma } from '@/lib/prisma';
import { startOfMonth, startOfDay } from 'date-fns';
import Link from 'next/link';
import { FilterBar } from '@/components/shared/FilterBar';
import { EngagementBadge } from '@/components/automation/EngagementBadge';
import { getAtRiskCount, getEngagementRate } from '@/lib/engagement';
import { numberedBranchLabel } from '@/lib/branches';

export const dynamic = 'force-dynamic';

const TYPE_COLORS: Record<string, string> = {
  welcome: '#dc2626',
  followus: '#dc2626',
  followus_reminder: '#f59e0b',
  video: '#f59e0b',
  review: '#f59e0b',
  referral: '#22c55e',
  birthday: '#f87171',
  blast: '#dc2626',
  festive: '#a855f7',
  promo: '#7c3aed',
};

const TYPE_ICONS: Record<string, string> = {
  welcome: '👋',
  followus: '📱',
  followus_reminder: '🔁',
  video: '🎥',
  review: '⭐',
  referral: '🎁',
  birthday: '🎂',
  blast: '📤',
  festive: '🎊',
  promo: '📣',
};

async function getData(branch: string, program: string) {
  const monthStart = startOfMonth(new Date());
  const todayStart = startOfDay(new Date());
  const parentWhere = {
    ...(branch !== 'all' ? { branch: { name: branch } } : {}),
    ...(program !== 'all' ? { program } : {}),
  };

  const [
    totalParents,
    activeParents,
    smsThisMonth,
    pendingBirthdays,
    recentLogs,
    upcomingEvents,
    ruleStats,
    atRisk,
    engagementRate,
    branches,
    programs,
  ] = await Promise.all([
    prisma.parent.count({ where: parentWhere }),
    prisma.parent.count({ where: { ...parentWhere, status: 'active' } }),
    prisma.sendLog.count({ where: { status: 'SENT', sentAt: { gte: monthStart }, parent: parentWhere } }),
    prisma.parent.count({ where: { ...parentWhere, birthday: null, status: 'active' } }),
    prisma.sendLog.findMany({
      where: { parent: parentWhere },
      orderBy: { sentAt: 'desc' },
      take: 15,
      include: { parent: { select: { id: true, name: true, studentName: true, branch: { select: { name: true } } } } },
    }),
    prisma.calendarEvent.findMany({
      where: { date: { gte: new Date() } },
      orderBy: { date: 'asc' },
      take: 5,
    }),
    Promise.all(
      ['welcome', 'video', 'review', 'referral', 'birthday'].map(async (t) => ({
        type: t,
        count: await prisma.sendLog.count({ where: { contentType: t, status: 'SENT', sentAt: { gte: todayStart }, parent: parentWhere } }),
        skipped: await prisma.sendLog.count({ where: { contentType: t, status: 'SKIPPED', parent: parentWhere } }),
      })),
    ).then(async (stats) => [
      ...stats,
      {
        type: 'festive',
        // festive contentTypes are `festive_<slug>` / `festive_<slug>_pre`, not an exact match
        count: await prisma.sendLog.count({ where: { contentType: { startsWith: 'festive' }, status: 'SENT', sentAt: { gte: todayStart }, parent: parentWhere } }),
        skipped: await prisma.sendLog.count({ where: { contentType: { startsWith: 'festive' }, status: 'SKIPPED', parent: parentWhere } }),
      },
    ]),
    getAtRiskCount({ branch, program }),
    getEngagementRate({ branch, program }),
    prisma.ebrightCepBranch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.parent.findMany({ distinct: ['program'], select: { program: true } }),
  ]);

  return {
    totalParents,
    activeParents,
    smsThisMonth,
    pendingBirthdays,
    recentLogs,
    upcomingEvents,
    ruleStats,
    atRisk,
    engagementRate,
    branches: branches.map((b) => b.name),
    programs: programs.map((p) => p.program),
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { branch?: string; program?: string };
}) {
  const branch = searchParams.branch || 'all';
  const program = searchParams.program || 'all';
  const data = await getData(branch, program);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Dashboard</h1>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 0' }}>Live view of the Ebright SMS engine</p>
      </div>

      <FilterBar
        current={{ branch, program }}
        filters={[
          { key: 'branch', label: 'Branches', options: data.branches.map((b, i) => ({ value: b, label: numberedBranchLabel(i, b) })) },
          { key: 'program', label: 'Programs', options: data.programs.map((p) => ({ value: p, label: p })) },
        ]}
      />

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '12px' }}>
        <StatCard label="Total parents" value={data.totalParents} />
        <StatCard label="Active" value={data.activeParents} accent="#22c55e" />
        <StatCard label="Sends this month" value={data.smsThisMonth} accent="#dc2626" />
        <StatCard label="Pending birthdays" value={data.pendingBirthdays} accent="#f59e0b" />
      </div>

      {/* Headline: at-risk + engagement rate */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '11px', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>
            Low engagement
          </div>
          <div style={{ fontSize: '28px', fontWeight: 600, color: '#dc2626', marginTop: '6px' }}>{data.atRisk}</div>
          <div style={{ fontSize: '11px', color: '#991b1b', marginTop: '4px' }}>Sent to, but no open/click in 30 days</div>
        </div>
        <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>
            Engagement rate
          </div>
          <div style={{ fontSize: '28px', fontWeight: 600, color: '#111827', marginTop: '6px' }}>{data.engagementRate.toFixed(1)}%</div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Opened or clicked, of delivered (30 days)</div>
        </div>
      </div>

      {/* Automation health strip */}
      <div
        style={{
          background: '#f9fafb',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '24px',
          display: 'flex',
          gap: '14px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
          Automation health
        </span>
        {data.ruleStats.map((r) => (
          <div
            key={r.type}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#ffffff',
              padding: '4px 10px',
              borderRadius: '999px',
              border: '1px solid #e5e7eb',
              fontSize: '12px',
            }}
          >
            <span>{TYPE_ICONS[r.type]}</span>
            <span style={{ color: '#111827', textTransform: 'capitalize' }}>{r.type}</span>
            <span style={{ color: '#22c55e', fontWeight: 600 }}>✓</span>
            <span style={{ color: '#9ca3af' }}>{r.count} today</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Recent activity */}
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Recent activity</div>
            <Link href="/automation/queue" style={{ fontSize: '12px', color: '#dc2626' }}>
              View queue →
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data.recentLogs.length === 0 && (
              <div style={{ fontSize: '13px', color: '#9ca3af', padding: '12px 0' }}>No activity yet.</div>
            )}
            {data.recentLogs.map((log) => (
              <div key={log.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    background: (TYPE_COLORS[log.contentType] ?? '#9ca3af') + '18',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    flexShrink: 0,
                  }}
                >
                  {TYPE_ICONS[log.contentType] ?? '📩'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: '#111827' }}>
                    <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{log.contentType.replace('_', ' ')}</span>{' '}
                    {log.status === 'SENT' ? 'sent to' : log.status + ' —'}{' '}
                    <Link href={`/parents/${log.parent?.id ?? ''}`} style={{ color: '#dc2626' }}>
                      {log.parent?.name ?? '(unknown)'}
                    </Link>
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                    {log.parent?.studentName} · {log.parent?.branch?.name} ·{' '}
                    {new Date(log.sentAt ?? log.createdAt).toLocaleString('en-MY', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <EngagementBadge status={log.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming events */}
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Upcoming events</div>
          {data.upcomingEvents.length === 0 && (
            <div style={{ fontSize: '13px', color: '#9ca3af' }}>No upcoming events.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data.upcomingEvents.map((e) => (
              <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: '13px', color: '#111827', fontWeight: 500 }}>{e.title}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                  {new Date(e.date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
                  {e.branch ?? 'All branches'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px' }}>
      <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 600, color: accent ?? '#111827', marginTop: '6px' }}>{value}</div>
    </div>
  );
}
