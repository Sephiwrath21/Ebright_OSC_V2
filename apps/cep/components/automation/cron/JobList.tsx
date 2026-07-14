'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { JobCard } from './JobCard';

interface Job {
  id: string;
  name: string;
  channel: string;
  segmentBranch: string;
  segmentStatus: string;
  intervalMinutes: number;
  isActive: boolean;
  nextRunAt: Date;
}

export function JobList({ jobs }: { jobs: Job[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleStop = async (id: string) => {
    setError(null);
    const res = await fetch('/api/autoblast/jobs/' + id + '/stop', { method: 'POST' });
    if (!res.ok) { setError('Failed to stop job'); return; }
    startTransition(() => router.refresh());
  };

  const handleRestart = async (id: string) => {
    setError(null);
    const res = await fetch('/api/autoblast/jobs/' + id + '/restart', { method: 'POST' });
    if (!res.ok) { setError('Failed to restart job'); return; }
    startTransition(() => router.refresh());
  };

  const active = jobs.filter((j) => j.isActive);
  const stopped = jobs.filter((j) => !j.isActive);

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Active and recent jobs</h3>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>{active.length} on air - {stopped.length} stopped</span>
      </div>
      {error && (
        <div style={{ padding: '10px 16px', background: '#fef2f2', color: '#991b1b', fontSize: '12px' }}>
          Failed: {error}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
        {jobs.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
            No auto-blast jobs found. Create one from the Blast page.
          </div>
        ) : (
          jobs.map((job) => (
            <JobCard key={job.id} {...job} onStop={handleStop} onRestart={handleRestart} />
          ))
        )}
      </div>
    </div>
  );
}