import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { differenceInCalendarMonths, differenceInDays } from 'date-fns';
import { notFound } from 'next/navigation';
import { PlanTypeEditor } from '@/components/parents/PlanTypeEditor';

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
};

function initials(name: string): string {
  return name
    .replace(/^(Pn\.|En\.)\s*/, '')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default async function ParentProfilePage({ params }: { params: { id: string } }) {
  const parent = await prisma.parent.findUnique({
    where: { id: params.id },
    include: { sendLogs: { orderBy: { sentAt: 'desc' } }, branch: true },
  });
  if (!parent) notFound();

  const now = new Date();
  const currentMonth = now < parent.m1StartDate ? 1 : differenceInCalendarMonths(now, parent.m1StartDate) + 1;
  const daysSince = differenceInDays(now, parent.enrollDate);

  const timelineDots = Array.from({ length: parent.programDur }, (_, i) => {
    const monthNum = i + 1;
    if (monthNum < currentMonth) return 'past';
    if (monthNum === currentMonth) return 'current';
    return 'future';
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <Link href="/parents" style={{ fontSize: '12px', color: '#dc2626', textDecoration: 'none' }}>
        ← Back to parents
      </Link>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginTop: '16px',
          marginBottom: '24px',
          paddingBottom: '20px',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #dc2626, #991b1b)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            fontWeight: 600,
          }}
        >
          {initials(parent.name)}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>{parent.name}</h1>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            {parent.phone} · {parent.branch.name} · {parent.program} ({parent.programDur} months)
          </div>
        </div>
        <span
          style={{
            padding: '4px 12px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            background:
              parent.status === 'active' ? '#dcfce7' : parent.status === 'trial' ? '#fef3c7' : '#f3f4f6',
            color: parent.status === 'active' ? '#16a34a' : parent.status === 'trial' ? '#a16207' : '#6b7280',
          }}
        >
          {parent.status}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        {/* Profile */}
        <div>
          <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', fontWeight: 600 }}>
              Profile
            </div>
            <ProfileField label="Student" value={parent.studentName} />
            <PlanTypeEditor parentId={parent.id} planType={parent.plan_type} />
            <ProfileField label="Email" value={parent.email} />
            <ProfileField label="Enrolled" value={new Date(parent.enrollDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} />
            <ProfileField label="Days since" value={`${daysSince} days`} />
            <ProfileField label="M1 start" value={new Date(parent.m1StartDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} />
            <ProfileField
              label="Birthday"
              value={
                parent.birthday
                  ? new Date(parent.birthday).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'Not set'
              }
              warn={!parent.birthday}
            />
          </div>

          <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px', marginTop: '16px' }}>
            <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', fontWeight: 600 }}>
              Program progress (Month {currentMonth} of {parent.programDur})
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {timelineDots.map((s, i) => (
                <div
                  key={i}
                  title={`Month ${i + 1}`}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: s === 'past' ? '#22c55e' : s === 'current' ? '#ffffff' : '#e5e7eb',
                    border: s === 'current' ? '2px solid #dc2626' : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Activity timeline</div>
          <div style={{ position: 'relative', paddingLeft: '28px' }}>
            <div
              style={{
                position: 'absolute',
                left: '13px',
                top: '8px',
                bottom: '8px',
                width: '2px',
                background: '#e5e7eb',
              }}
            />
            {parent.sendLogs.length === 0 && (
              <div style={{ fontSize: '13px', color: '#9ca3af' }}>No activity yet.</div>
            )}
            {parent.sendLogs.map((log) => (
              <div key={log.id} style={{ position: 'relative', paddingBottom: '18px' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: '-28px',
                    top: '2px',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: (TYPE_COLORS[log.contentType] ?? '#9ca3af') + (log.status === 'SKIPPED' ? '00' : '18'),
                    border: log.status === 'SKIPPED' ? '2px dashed #9ca3af' : `2px solid ${TYPE_COLORS[log.contentType] ?? '#9ca3af'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                  }}
                >
                  {TYPE_ICONS[log.contentType] ?? '📩'}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>
                    <span style={{ textTransform: 'capitalize' }}>{log.contentType.replace('_', ' ')}</span>
                    {log.status === 'SKIPPED' ? ' skipped' : ' sent'}
                    {log.monthNumber ? ` — Month ${log.monthNumber}${log.weekNumber ? ' W' + log.weekNumber : ''}` : ''}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                    {new Date(log.sentAt ?? log.createdAt).toLocaleString('en-MY', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {log.reason ? ` · ${log.reason}` : ''}
                  </div>
                  {log.message && (
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#374151',
                        marginTop: '6px',
                        padding: '8px 12px',
                        background: '#f9fafb',
                        borderRadius: '6px',
                        maxWidth: '520px',
                      }}
                    >
                      {log.message.length > 200 ? log.message.slice(0, 200) + '…' : log.message}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px' }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ color: warn ? '#f59e0b' : '#111827', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
