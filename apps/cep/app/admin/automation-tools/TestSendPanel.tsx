'use client';

import { useState } from 'react';

interface ParentOption {
  id: string;
  name: string;
  studentName: string;
  branch: string;
}

interface TestSendPanelProps {
  parents: ParentOption[];
  cronEnabled: boolean;
}

interface TestSendResult {
  trigger: string;
}

// Matches TEST_TRIGGERS in app/api/cron/test_parent/route.ts exactly — that route
// only recognises these legacy TriggerType values, not rule-engine/festive names.
const TRIGGERS = [
  { value: '', label: 'Any due trigger (fires all of the below)' },
  { value: 'DAY0_WELCOME', label: 'Welcome' },
  { value: 'DAY14_REMINDER', label: 'Follow us (Day 14)' },
  { value: 'DAY42_REVIEW', label: 'Review' },
  { value: 'DAY56_REFERRAL', label: 'Referral' },
  { value: 'WEEKLY_VIDEO', label: 'Video' },
  { value: 'BIRTHDAY', label: 'Birthday' },
];

export function TestSendPanel({ parents, cronEnabled }: TestSendPanelProps) {
  const [parentId, setParentId] = useState('');
  const [trigger, setTrigger] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSend = async () => {
    if (!parentId) {
      setResult({ ok: false, message: 'Pick a parent first.' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/cron/test_parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId, trigger: trigger || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setResult({
        ok: true,
        message: `Sent to ${data.parent}: ${data.results.map((r: TestSendResult) => r.trigger).join(', ')}`,
      });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600 }}>Test send</h3>
      <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#6b7280' }}>
        Fire a message to a specific parent right now, ignoring the day-based schedule.
      </p>

      <div
        style={{
          marginBottom: '12px',
          padding: '10px 12px',
          borderRadius: '8px',
          fontSize: '12px',
          background: cronEnabled ? '#eff6ff' : '#fffbeb',
          color: cronEnabled ? '#1d4ed8' : '#92400e',
        }}
      >
        {cronEnabled
          ? 'ℹ️ Auto-blast is currently running — this fires an extra one-off send on top of the normal schedule.'
          : '⚠️ Auto-blast is currently stopped — this will still fire once regardless of that. It does not turn auto-blast back on.'}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="ebright-select"
          style={{ flex: '1 1 200px' }}
        >
          <option value="">Select parent…</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.studentName} ({p.branch})
            </option>
          ))}
        </select>

        <select
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          className="ebright-select"
          style={{ flex: '0 0 220px' }}
        >
          {TRIGGERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <button
          onClick={handleSend}
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: '#ef4444',
            color: '#fff',
            fontWeight: 500,
            fontSize: '13px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Sending…' : 'Send test'}
        </button>
      </div>

      {result && (
        <div
          style={{
            marginTop: '10px',
            fontSize: '12px',
            padding: '8px 10px',
            borderRadius: '6px',
            background: result.ok ? '#f0fdf4' : '#fef2f2',
            color: result.ok ? '#166534' : '#991b1b',
          }}
        >
          {result.ok ? '✅ ' : '❌ '}
          {result.message}
        </div>
      )}
    </div>
  );
}
