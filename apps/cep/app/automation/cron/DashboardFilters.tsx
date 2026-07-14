'use client';

import { useRouter, usePathname } from 'next/navigation';
import { numberedBranchLabel } from '@/lib/branches';

interface DashboardFiltersProps {
  options: {
    branches: string[];
    programs: string[];
  };
  current: {
    branch: string;
    program: string;
  };
}

export function DashboardFilters({ options, current }: DashboardFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleFilterChange = (type: 'branch' | 'program', value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value === 'all') {
      params.delete(type);
    } else {
      params.set(type, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
      <select value={current.branch} onChange={(e) => handleFilterChange('branch', e.target.value)} className="ebright-select" style={{ width: 'auto' }}>
        <option value="all">All Branches</option>
        {options.branches.map((branch, i) => (<option key={branch} value={branch}>{numberedBranchLabel(i, branch)}</option>))}
      </select>
      <select value={current.program} onChange={(e) => handleFilterChange('program', e.target.value)} className="ebright-select" style={{ width: 'auto' }}>
        <option value="all">All Programs</option>
        {options.programs.map((program) => (<option key={program} value={program}>{program}</option>))}
      </select>
    </div>
  );
}