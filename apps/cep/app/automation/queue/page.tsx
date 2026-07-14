import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { EngagementBadge } from '@/components/automation/EngagementBadge';

export const dynamic = 'force-dynamic';

const TYPE_COLORS: Record<string, string> = {
  welcome: '#991b1b',
  followus: '#991b1b',
  followus_reminder: '#dc2626',
  video: '#dc2626',
  review: '#f59e0b',
  referral: '#22c55e',
  birthday: '#f87171',
  blast: '#dc2626',
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
  promo: '📣',
};

export default async function QueuePage() {
  const logs = await prisma.sendLog.findMany({
    orderBy: { sentAt: 'desc' },
    take: 200,
    include: { parent: { select: { id: true, name: true, studentName: true, branch: { select: { name: true } } } } },
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Send queue</h1>
      <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 24px' }}>{logs.length} log entries</p>

      <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1.4fr 1.5fr 1fr 1fr 100px', gap: '12px', padding: '10px 16px', fontSize: '10px', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 600, letterSpacing: '0.5px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          <div></div>
          <div>Type</div>
          <div>Parent</div>
          <div>When</div>
          <div>Trigger</div>
          <div>Status</div>
        </div>
        {logs.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
            No sends yet. Once automation, Blast, or Promo fires, sends will show up here.
          </div>
        )}
        {logs.map((l) => (
          <Link
            key={l.id}
            href={l.parent ? `/parents/${l.parent.id}` : '/automation/queue'}
            style={{
              display: 'grid',
              gridTemplateColumns: '40px 1.4fr 1.5fr 1fr 1fr 100px',
              gap: '12px',
              padding: '12px 16px',
              fontSize: '13px',
              color: '#111827',
              borderBottom: '1px solid #f3f4f6',
              textDecoration: 'none',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '6px',
                background: (TYPE_COLORS[l.contentType] ?? '#9ca3af') + '18',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
              }}
            >
              {TYPE_ICONS[l.contentType] ?? '📩'}
            </div>
            <div>
              <div style={{ textTransform: 'capitalize', fontWeight: 500 }}>{l.contentType.replace('_', ' ')}</div>
              <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                {l.monthNumber ? `M${l.monthNumber}` : ''} {l.weekNumber ? `W${l.weekNumber}` : ''}
              </div>
            </div>
            <div>
              <div>{l.parent?.name ?? '—'}</div>
              <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                {l.parent?.studentName} · {l.parent?.branch?.name}
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {new Date(l.sentAt ?? l.createdAt).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'capitalize' }}>{l.triggeredBy}</div>
            <div>
              <EngagementBadge status={l.status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
