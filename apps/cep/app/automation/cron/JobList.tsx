'use client';

import { useEffect, useState } from 'react';

interface Job {
  id: string;
  name: string;
  channel: string;
  segmentBranch: string;
  segmentStatus: string;
  intervalMinutes: number;
  isActive: boolean;
  nextRunAt: Date | string | null;
}

interface JobListProps {
  jobs?: Job[];
}

function getChannelIcon(channel: string) {
  const c = (channel ?? '').toUpperCase();
  if (c === 'EMAIL') return { label: 'Email', color: '#3b82f6', bg: '#eff6ff' };
  if (c === 'SMS')   return { label: 'SMS',   color: '#9333ea', bg: '#faf5ff' };
  return                    { label: c || 'Email', color: '#3b82f6', bg: '#eff6ff' };
}

function useCountdown(nextRunAt: Date | string | null, isActive: boolean) {
  const [secs, setSecs] = useState<number | null>(null);

  useEffect(() => {
    if (!isActive || !nextRunAt) { setSecs(null); return; }
    const tick = () => {
      const diff = Math.floor((new Date(nextRunAt).getTime() - Date.now()) / 1000);
      setSecs(diff > 0 ? diff : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRunAt, isActive]);

  if (secs === null) return '--:--';
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function JobRow({ job }: { job: Job }) {
  const countdown = useCountdown(job.nextRunAt, job.isActive);
  const ch = getChannelIcon(job.channel);

  async function handleToggle() {
    await fetch(`/api/autoblast/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !job.isActive }),
    });
    window.location.reload();
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '14px 20px',
      borderTop: '1px solid #f3f4f6',
      gap: '16px',
    }}>

      {/* Status dot + badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '90px' }}>
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
          background: job.isActive ? '#22c55e' : '#d1d5db',
          boxShadow: job.isActive ? '0 0 0 3px #bbf7d0' : 'none',
        }} />
        <span style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
          color: job.isActive ? '#16a34a' : '#9ca3af',
        }}>
          {job.isActive ? 'ON AIR' : 'STOPPED'}
        </span>
      </div>

      {/* Name + pills + interval */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827', marginBottom: '6px' }}>
          {job.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Channel pill */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 500,
            background: ch.bg, color: ch.color, border: `1px solid ${ch.color}33`,
          }}>
            {ch.label === 'Email' ? '\u2709' : '\u{1F4F1}'} {ch.label}
          </span>
          {/* Branch */}
          <span style={{
            padding: '2px 8px', borderRadius: '999px', fontSize: '11px',
            background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
          }}>
            {job.segmentBranch === 'all' ? 'All branches' : job.segmentBranch}
          </span>
        </div>
        {/* Interval on its own line */}
        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
          every {job.intervalMinutes} min
        </div>
      </div>

      {/* Countdown */}
      <div style={{ textAlign: 'right', minWidth: '90px' }}>
        {job.isActive && (
          <div style={{
            fontSize: '10px', color: '#9ca3af', marginBottom: '2px',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Next send
          </div>
        )}
        <div style={{
          fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          color: job.isActive ? '#111827' : '#d1d5db',
          letterSpacing: '0.02em',
        }}>
          {countdown}
        </div>
      </div>

      {/* Action button */}
      <div style={{ minWidth: '70px', textAlign: 'right' }}>
        <button
          onClick={handleToggle}
          style={{
            padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            border: 'none', cursor: 'pointer',
            background: job.isActive ? '#fee2e2' : '#f3f4f6',
            color: job.isActive ? '#dc2626' : '#374151',
          }}
        >
          {job.isActive ? 'Stop' : 'Restart'}
        </button>
      </div>
    </div>
  );
}

export function JobList({ jobs = [] }: JobListProps) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 20px', borderBottom: '1px solid #e5e7eb',
      }}>
        <span style={{
          fontWeight: 700, fontSize: '13px',
          textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280',
        }}>
          Active &amp; Recent Jobs
        </span>
      </div>

      {jobs.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
          No jobs configured.
        </div>
      ) : (
        jobs.map((job) => <JobRow key={job.id} job={job} />)
      )}
    </div>
  );
}