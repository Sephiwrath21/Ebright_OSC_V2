'use client';

import { useEffect, useState } from 'react';

interface JobCardProps {
  id: string;
  name: string;
  channel: string;
  segmentBranch: string;
  segmentStatus: string;
  intervalMinutes: number;
  isActive: boolean;
  nextRunAt: Date;
  onStop: (id: string) => Promise<void>;
  onRestart: (id: string) => Promise<void>;
}

function Countdown({ nextRunAt }: { nextRunAt: Date }) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(nextRunAt).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor((new Date(nextRunAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [nextRunAt]);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
      {mins}:{secs}
    </span>
  );
}

const CHANNEL_COLORS: Record<string, { bg: string; color: string; icon: string }> = {
  email: { bg: '#eff6ff', color: '#1d4ed8', icon: 'e' },
  sms: { bg: '#f0fdf4', color: '#166534', icon: 's' },
  whatsapp: { bg: '#f0fdf4', color: '#15803d', icon: 'w' },
};

export function JobCard({
  id, name, channel, segmentBranch, intervalMinutes, isActive, nextRunAt, onStop, onRestart,
}: JobCardProps) {
  const [loading, setLoading] = useState(false);
  const ch = CHANNEL_COLORS[channel?.toLowerCase()] ?? { bg: '#f9fafb', color: '#6b7280', icon: 'm' };

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isActive) await onStop(id);
      else await onRestart(id);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isActive ? '#f59e0b' : '#d1d5db', flexShrink: 0, boxShadow: isActive ? '0 0 0 3px #fef3c7' : 'none' }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827', marginBottom: '4px' }}>{name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '99px', background: ch.bg, color: ch.color }}>
              {ch.icon} {channel ?? 'email'}
            </span>
            <span style={{ fontSize: '11px', color: '#6b7280' }}>
              {segmentBranch === 'all' || !segmentBranch ? 'All branches' : segmentBranch}
            </span>
            <span style={{ fontSize: '11px', color: '#6b7280' }}>every {intervalMinutes} min</span>
          </div>
        </div>
      </div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: isActive ? '#f59e0b' : '#9ca3af', minWidth: '60px', textAlign: 'center' }}>
        {isActive ? 'ON AIR' : 'STOPPED'}
      </div>
      {isActive ? (
        <div style={{ textAlign: 'right', minWidth: '80px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', marginBottom: '2px' }}>NEXT SEND</div>
          <Countdown nextRunAt={nextRunAt} />
        </div>
      ) : (
        <div style={{ minWidth: '80px', textAlign: 'right', fontSize: '20px', color: '#d1d5db', fontWeight: 700 }}>-:-</div>
      )}
      <button
        onClick={handleToggle}
        disabled={loading}
        style={{ padding: '6px 16px', borderRadius: '8px', border: isActive ? '1px solid #fca5a5' : '1px solid #e5e7eb', background: isActive ? '#fff1f2' : '#ffffff', color: isActive ? '#ef4444' : '#374151', fontSize: '13px', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, flexShrink: 0 }}
      >
        {loading ? '...' : isActive ? 'Stop' : 'Restart'}
      </button>
    </div>
  );
}