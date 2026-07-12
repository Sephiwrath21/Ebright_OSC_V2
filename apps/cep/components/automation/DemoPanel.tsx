'use client';

import { useState } from 'react';

interface DemoAction {
  id: string;
  label: string;
  endpoint: string;
  description: string;
  emoji: string;
}

const ACTIONS: DemoAction[] = [
  {
    id: 'run',
    label: 'Run cron now',
    endpoint: '/api/cron/simulate/run-all',
    description: 'Fires all due day-based triggers + real emails',
    emoji: '▶',
  },
  {
    id: 'welcome',
    label: 'Simulate new enrollment',
    endpoint: '/api/cron/simulate/welcome',
    description: 'Fires welcome + follow us (bell +2)',
    emoji: '👋',
  },
  {
    id: 'followus',
    label: 'Trigger Day-14 follow us',
    endpoint: '/api/cron/simulate/followus',
    description: 'Runs Day-14 reminder for all eligible',
    emoji: '📱',
  },
  {
    id: 'video',
    label: 'Trigger Monday video blast',
    endpoint: '/api/cron/simulate/video',
    description: 'Runs video check for all parents',
    emoji: '🎥',
  },
  {
    id: 'review',
    label: 'Trigger Day-42 review',
    endpoint: '/api/cron/simulate/review',
    description: 'Runs review for all eligible',
    emoji: '⭐',
  },
  {
    id: 'referral',
    label: 'Trigger Day-56 referral',
    endpoint: '/api/cron/simulate/referral',
    description: 'Runs referral for all eligible',
    emoji: '🎁',
  },
  {
    id: 'birthday-send',
    label: 'Trigger birthday SMS',
    endpoint: '/api/cron/simulate/birthday-send',
    description: 'Sends birthday to Zayn Aqil',
    emoji: '🎂',
  },
  {
    id: 'birthday-skip',
    label: 'Trigger birthday skip',
    endpoint: '/api/cron/simulate/birthday-skip',
    description: 'Logs skip for Amirah (birthday null)',
    emoji: '⏭️',
  },
];

interface Result {
  actionId: string;
  data: unknown;
  ok: boolean;
  ts: number;
}

export function DemoPanel() {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const trigger = async (a: DemoAction) => {
    setLoading(a.id);
    setResult(null);
    try {
      const res = await fetch(a.endpoint, { method: 'POST' });
      const data = await res.json();
      setResult({ actionId: a.id, data, ok: res.ok, ts: Date.now() });
    } catch (err) {
      setResult({
        actionId: a.id,
        data: { error: err instanceof Error ? err.message : String(err) },
        ok: false,
        ts: Date.now(),
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div
      style={{
        background: '#f9fafb',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #e5e7eb',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: '#9ca3af',
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          marginBottom: '4px',
        }}
      >
        Demo controls — for presentation
      </div>
      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
        Click any button to simulate a trigger. Bell updates within 10 seconds.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
        {ACTIONS.map((a) => {
          const isLoading = loading === a.id;
          const isHero = a.id === 'run';
          return (
            <button
              key={a.id}
              onClick={() => trigger(a)}
              disabled={loading !== null}
              style={{
                background: isHero ? '#dc2626' : '#ffffff',
                color: isHero ? '#ffffff' : '#111827',
                border: isHero ? 'none' : '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: loading !== null ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                opacity: loading !== null && !isLoading ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '16px' }}>{isLoading ? '⚙️' : a.emoji}</span>
                <span style={{ fontWeight: 600 }}>{isLoading ? 'Running…' : a.label}</span>
              </div>
              <div style={{ fontSize: '11px', color: isHero ? 'rgba(255,255,255,0.75)' : '#6b7280', lineHeight: 1.4 }}>
                {a.description}
              </div>
            </button>
          );
        })}
      </div>

      {result && (
        <div
          style={{
            marginTop: '16px',
            padding: '14px',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        >
          <div style={{ fontWeight: 600, color: result.ok ? '#22c55e' : '#ef4444', marginBottom: '8px' }}>
            {result.ok ? '✅ Trigger complete' : '❌ Trigger failed'}
          </div>
          <pre
            style={{
              background: '#f9fafb',
              padding: '10px',
              borderRadius: '6px',
              overflow: 'auto',
              maxHeight: '260px',
              margin: 0,
              fontSize: '11px',
              fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
              color: '#374151',
            }}
          >
            {JSON.stringify(result.data, null, 2)}
          </pre>
          <div style={{ marginTop: '10px', color: '#9ca3af', fontSize: '11px' }}>
            Emails (if configured) sent to <strong>sofiadlinaalie@gmail.com</strong>. Bell polls every 10s.
          </div>
        </div>
      )}
    </div>
  );
}
