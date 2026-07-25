'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLAN_TYPES, PLAN_TYPE_LABELS } from '@/lib/planTypes';

export function PlanTypeEditor({ parentId, planType }: { parentId: string; planType: string | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value || null;
    setSaving(true);
    try {
      await fetch(`/api/parents/${parentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_type: value }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: '13px' }}>
      <span style={{ color: '#6b7280' }}>Plan</span>
      <select
        defaultValue={planType ?? ''}
        onChange={onChange}
        disabled={saving}
        className="ebright-select"
        style={{ width: 'auto', fontSize: '12px', fontWeight: 500, padding: '4px 22px 4px 8px' }}
      >
        <option value="">Not set</option>
        {PLAN_TYPES.map((p) => (
          <option key={p} value={p}>
            {PLAN_TYPE_LABELS[p]}
          </option>
        ))}
      </select>
    </div>
  );
}
