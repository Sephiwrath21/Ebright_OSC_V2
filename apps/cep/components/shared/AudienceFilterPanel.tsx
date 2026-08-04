'use client';

import { useEffect, useState } from 'react';
import { PLAN_TYPES, PLAN_TYPE_LABELS } from '@/lib/planTypes';
import { numberedBranchLabel } from '@/lib/branches';

export interface AudiencePreview {
  count: number;
  parents: { id: string; name: string; studentName: string; branch: string; phone: string }[];
  estimatedCost: { sms: string; wa: string; total: string };
}

export const audienceInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid #e5e7eb',
  fontSize: '13px',
  background: '#ffffff',
  color: '#111827',
};

export function AudienceField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Shared branch/status/program-month/plan audience filter — used by both the
 * Blast page and the Promo page (Ebright CEP batch, Part 2) so the filtering
 * UI/logic isn't duplicated across the two. Manages its own filter state and
 * fetches /api/blast/preview (a generic parent-filtering query with no
 * Blast-specific logic in it, so both pages can reuse it as-is) whenever the
 * filters change, reporting the result up via onPreviewChange.
 */
export function AudienceFilterPanel({ onPreviewChange }: { onPreviewChange: (preview: AudiencePreview | null) => void }) {
  const [branch, setBranch] = useState('all');
  const [status, setStatus] = useState('active');
  const [month, setMonth] = useState('all');
  const [planType, setPlanType] = useState('all');
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch('/api/branches?activeOnly=1', { cache: 'no-store' })
      .then((res) => res.json())
      .then(setBranches);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetch(
        `/api/blast/preview?branch=${branch}&status=${status}&month=${month}&planType=${planType}`,
        { cache: 'no-store' },
      );
      const data = await res.json();
      if (!cancelled) onPreviewChange(data);
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, status, month, planType]);

  return (
    <>
      <AudienceField label="Branch">
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className="ebright-select">
          <option value="all">All branches</option>
          {branches.map((b, i) => (
            <option key={b.id} value={b.name}>{numberedBranchLabel(i, b.name)}</option>
          ))}
        </select>
      </AudienceField>

      <AudienceField label="Status">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="ebright-select">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="inactive">Inactive</option>
        </select>
      </AudienceField>

      <AudienceField label="Program month">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="ebright-select">
          <option value="all">All months</option>
          <option value="1">Month 1</option>
          <option value="2">Month 2</option>
          <option value="3">Month 3</option>
        </select>
      </AudienceField>

      <AudienceField label="Plan">
        <select value={planType} onChange={(e) => setPlanType(e.target.value)} className="ebright-select">
          <option value="all">All plans</option>
          {PLAN_TYPES.map((p) => (
            <option key={p} value={p}>
              {PLAN_TYPE_LABELS[p]}
            </option>
          ))}
        </select>
      </AudienceField>
    </>
  );
}
