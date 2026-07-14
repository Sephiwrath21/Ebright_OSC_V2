'use client';

import Link from 'next/link';
import { Breadcrumb } from './Breadcrumb';
import { StatCard } from './StatCard';
import { ActivityFeed } from './ActivityFeed';
import { AutoBlastToggle } from './AutoBlastToggle';
import { ParentStatusTable } from './ParentStatusTable';
import { JobList } from './JobList';
import { DashboardFilters } from './DashboardFilters';

export type EngagementStatus =
  | 'QUEUED' | 'SENT' | 'DELIVERED' | 'OPENED' | 'CLICKED' | 'FAILED' | 'SKIPPED';

export interface CronMonitorViewProps {
  totals: {
    video: number;
    followus: number;
    review: number;
    referral: number;
    renewal: number;
    birthday: number;
    festive: number;
    engagementRate?: number;
    atRisk?: number;
    runs: number;
  };
  activityRows: Array<{
    id: string;
    timestamp: Date;
    parentName: string;
    contentType: string;
    status: EngagementStatus;
  }>;
  parentStatuses: Array<{
    id: string;
    name: string;
    studentName: string;
    branch: string;
    daysSinceEnroll: number;
    plan_type: string;
    followup: 'sent' | 'due' | 'upcoming';
    review: 'sent' | 'due' | 'upcoming';
    referral: 'sent' | 'due' | 'upcoming';
    renewal: 'sent' | 'due' | 'upcoming' | 'disabled';
    video: 'sent' | 'pending';
    birthdayToday: boolean;
    festiveToday: boolean;
  }>;
  jobs: Array<{
    id: string;
    name: string;
    channel: string;
    segmentBranch: string;
    segmentStatus: string;
    intervalMinutes: number;
    isActive: boolean;
    nextRunAt: Date | string | null;
  }>;
  cronEnabled: boolean;
  nextTickAt: string;
  filterOptions: {
    branches: string[];
    programs: string[];
  };
  currentFilters: {
    branch: string;
    program: string;
  };
}

export function CronMonitorView({
  totals, activityRows, parentStatuses, jobs, cronEnabled, nextTickAt,
  filterOptions, currentFilters,
}: CronMonitorViewProps) {
  return (
    <div style={{ padding: '24px 32px' }}>
      <Breadcrumb segments={[
        { label: 'Home', href: '/' },
        { label: 'Automation', href: '/automation' },
        { label: 'Cron monitor' },
      ]} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>Cron monitor</h1>
          <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 0' }}>
            Day-based automation — blasts every minute while running.
          </p>
        </div>
        <AutoBlastToggle initialEnabled={cronEnabled} initialNextTickAt={nextTickAt} />
      </div>

      <div style={{ marginTop: '24px', borderBottom: '1px solid #e5e7eb', paddingBottom: '24px' }}>
        <DashboardFilters options={filterOptions} current={currentFilters} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
          <StatCard label="Runs (recent)" value={totals.runs} />
          <StatCard label="Low Engagement" value={totals.atRisk ?? 0} color="#f97316" />
          <StatCard label="Engagement (30d)" value={`${(totals.engagementRate ?? 0).toFixed(1)}%`} color="#ef4444" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '16px' }}>
          <StatCard label="Follow-up (30d)" value={totals.followus} color="#dc2626" />
          <StatCard label="Review (30d)" value={totals.review} color="#f59e0b" />
          <StatCard label="Referral (30d)" value={totals.referral} color="#22c55e" />
          <StatCard label="Renewal (30d)" value={totals.renewal} color="#ef4444" />
          <StatCard label="Birthday (30d)" value={totals.birthday} color="#f87171" />
          <StatCard label="Video (30d)" value={totals.video} color="#dc2626" />
          <StatCard label="Festive (30d)" value={totals.festive} color="#a855f7" />
        </div>
      </div>

      <div style={{ marginTop: '24px', marginBottom: '24px' }}>
        <JobList jobs={jobs} />
      </div>

      <div style={{ marginBottom: '16px', fontSize: '12px', color: '#9ca3af' }}>
        Need to force-fire a single rule for troubleshooting?{' '}
        <Link href="/admin/automation-tools" style={{ color: '#dc2626' }}>
          Go to admin automation tools →
        </Link>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <ParentStatusTable rows={parentStatuses} />
      </div>

      <ActivityFeed title="Cron Activity · Last 20 Sends" rows={activityRows} />
    </div>
  );
}