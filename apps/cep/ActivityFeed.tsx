'use client';

const CATEGORY_COLORS: Record<string, string> = {
  followus: '#60B5FF',
  video: '#8B5CF6',
  review: '#f59e0b',
  referral: '#22c55e',
  birthday: '#f87171',
};

interface ActivityFeedRowProps {
  timestamp: Date;
  duration: number;
  counts: Record<string, number>;
}

function ActivityFeedRow({ timestamp, duration, counts }: ActivityFeedRowProps) {
  const badges = Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      label: key,
      value,
      color: CATEGORY_COLORS[key.toLowerCase()] || '#9ca3af',
    }));

  const isNoOp = badges.length === 0;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid #f3f4f6',
        opacity: isNoOp ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ fontSize: '12px', fontFamily: 'ui-monospace, Menlo, monospace', color: '#6b7280', minWidth: '150px' }}>
          {timestamp.toLocaleString('en-MY', { dateStyle: 'short', timeStyle: 'medium', hour12: false })}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {badges.map((badge) => (
            <div
              key={badge.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                fontWeight: 500,
                background: `${badge.color}1A`,
                color: badge.color,
                padding: '2px 8px',
                borderRadius: '99px',
              }}
            >
              <span>{badge.label.charAt(0).toUpperCase() + badge.label.slice(1)}</span>
              <span style={{ fontSize: '10px', opacity: 0.8 }}>{badge.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: '12px', fontFamily: 'ui-monospace, Menlo, monospace', color: '#9ca3af' }}>{duration}ms</div>
    </div>
  );
}

export function ActivityFeed({ title, rows }: { title: string; rows: ActivityFeedRowProps[] }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{title}</h3>
      </div>
      <div>
        {rows.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
            No runs yet. Click &quot;Run cron now&quot; to trigger a run.
          </div>
        ) : (
          rows.map((row, i) => <ActivityFeedRow key={i} {...row} />)
        )}
      </div>
    </div>
  );
}
