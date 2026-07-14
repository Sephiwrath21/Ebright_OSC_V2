'use client';

import type { EngagementStatus } from './CronMonitorView';

const CATEGORY_COLORS: Record<string, string> = {
  followus: '#dc2626',
  video: '#dc2626',
  review: '#f59e0b',
  referral: '#22c55e',
  renewal: '#ef4444',
  birthday: '#f87171',
  festive: '#a855f7',
};

interface ActivityFeedRowProps {
  id: string;
  timestamp: Date;
  parentName: string;
  contentType: string;
  status: EngagementStatus;
}

function ActivityFeedRow({ timestamp, parentName, contentType, status }: ActivityFeedRowProps) {
  const baseContentType = contentType.split('_')[0];
  const badge = {
    label: contentType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    color: CATEGORY_COLORS[baseContentType] || '#9ca3af',
  };

  const isSuccess = status === 'SENT' || status === 'DELIVERED' || status === 'OPENED' || status === 'CLICKED';
  const statusIndicator = isSuccess ? '✅' : '❌';
  const statusColor = isSuccess ? '#22c55e' : '#ef4444';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid #f3f4f6'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ fontSize: '12px', fontFamily: 'ui-monospace, Menlo, monospace', color: '#6b7280', minWidth: '160px' }}>
          {timestamp.toLocaleString('en-MY', { dateStyle: 'short', timeStyle: 'medium', hour12: false })}
        </div>
        <div style={{ color: statusColor, fontSize: '14px', fontWeight: 'bold' }}>
          {statusIndicator}
        </div>
        <div
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
            minWidth: '100px',
            justifyContent: 'center',
          }}
        >
          <span>{badge.label}</span>
        </div>
        <div style={{ fontSize: '12px', color: '#374151' }}>to <strong>{parentName}</strong></div>
      </div>
    </div>
  );
}

export function ActivityFeed({ title, rows }: { title: string; rows: ActivityFeedRowProps[] }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{title}</h3>
      </div>
      <div>
        {rows.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
            No runs yet. Click &quot;Run cron now&quot; to trigger a run.
          </div>
        ) : (
          rows.map((row) => <ActivityFeedRow key={row.id} {...row} />)
        )}
      </div>
    </div>
  );
}