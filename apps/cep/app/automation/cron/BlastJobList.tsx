'use client';

interface BlastJob {
  label: string;
  description: string;
  color: string;
  bg: string;
}

const BLAST_JOBS: BlastJob[] = [
  { label: 'Follow-up',  description: 'Day 14 after enrolment',  color: '#3b82f6', bg: '#eff6ff' },
  { label: 'Review',     description: 'Day 42 after enrolment',  color: '#f59e0b', bg: '#fffbeb' },
  { label: 'Referral',   description: 'Day 56 after enrolment',  color: '#22c55e', bg: '#f0fdf4' },
  { label: 'Video',      description: 'Every Monday',            color: '#8b5cf6', bg: '#faf5ff' },
  { label: 'Renewal',    description: '30, 14, 3 days before expiry', color: '#ef4444', bg: '#fef2f2' },
  { label: 'Birthday',   description: 'Student birthday at 9am', color: '#f87171', bg: '#fef2f2' },
];

interface BlastJobListProps {
  running: boolean;
  secsLeft: number;
  firing: boolean;
  lastCounts: Record<string, number>;
}

export function BlastJobList({ running, secsLeft, firing, lastCounts }: BlastJobListProps) {
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');

  const countMap: Record<string, number> = {
    'Follow-up': lastCounts.followus ?? 0,
    'Review':    lastCounts.review   ?? 0,
    'Referral':  lastCounts.referral ?? 0,
    'Video':     lastCounts.video    ?? 0,
    'Renewal':   lastCounts.renewal  ?? 0,
    'Birthday':  lastCounts.birthday ?? 0,
  };

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid #e5e7eb',
        fontWeight: 700, fontSize: '13px',
        textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280',
      }}>
        Active &amp; Recent Jobs
      </div>

      {BLAST_JOBS.map((job) => (
        <div key={job.label} style={{
          display: 'flex', alignItems: 'center',
          padding: '14px 20px', borderTop: '1px solid #f3f4f6', gap: '16px',
        }}>
          {/* Status dot + badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '90px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
              background: running ? '#22c55e' : '#d1d5db',
              boxShadow: running ? '0 0 0 3px #bbf7d0' : 'none',
            }} />
            <span style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
              color: running ? '#16a34a' : '#9ca3af',
            }}>
              {running ? 'ON AIR' : 'STOPPED'}
            </span>
          </div>

          {/* Name + pills + interval */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827', marginBottom: '6px' }}>
              {job.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Type pill */}
              <span style={{
                padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 500,
                background: job.bg, color: job.color, border: `1px solid ${job.color}33`,
              }}>
                ✉ Email
              </span>
              {/* Last run count */}
              {countMap[job.label] > 0 && (
                <span style={{
                  padding: '2px 8px', borderRadius: '999px', fontSize: '11px',
                  background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                }}>
                  {countMap[job.label]} sent last run
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
              {job.description}
            </div>
          </div>

          {/* Countdown */}
          <div style={{ textAlign: 'right', minWidth: '90px' }}>
            {running && (
              <div style={{
                fontSize: '10px', color: '#9ca3af', marginBottom: '2px',
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {firing ? 'Sending…' : 'Next send'}
              </div>
            )}
            <div style={{
              fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              color: running ? (firing ? '#f59e0b' : '#111827') : '#d1d5db',
              letterSpacing: '0.02em',
            }}>
              {running ? (firing ? '––:––' : `${mm}:${ss}`) : '--:--'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}