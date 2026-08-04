'use client';

import { useState } from 'react';
import { ViewToggle, useViewPreference } from '@/components/shared/ViewToggle';

export interface RuleCardItem {
  id: string | number;
  name: string;
  isActive: boolean;
  layer: 'weekly' | 'monthly' | 'promo';
  display: { label: string; icon: string; color: string };
  trigger: string;
  sentToday: number;
  pending: number;
  lastFired: string | null;
}

const LAYERS = ['all', 'weekly', 'monthly', 'promo'] as const;
const LAYER_LABELS: Record<(typeof LAYERS)[number], string> = {
  all: 'All',
  weekly: 'Weekly',
  monthly: 'Monthly',
  promo: 'Promo',
};

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      style={{
        fontSize: '10px',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: '999px',
        background: isActive ? '#dcfce7' : '#f3f4f6',
        color: isActive ? '#16a34a' : '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        flexShrink: 0,
      }}
    >
      {isActive ? 'Live' : 'Paused'}
    </span>
  );
}

function lastFiredLabel(lastFired: string | null): string | null {
  if (!lastFired) return null;
  return new Date(lastFired).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Client-side filter pills over the Rules page's rule cards (Ebright CEP batch,
 * Part 3) — same interaction pattern as the Content library's channel pills.
 * Filtering is purely by the explicit `layer` field (docs/architecture.md), never
 * inferred from name/trigger type. Grid/list view toggle (batch follow-up) sits
 * on the same row as the pills — filtering logic is identical in both views,
 * only the rendering differs.
 */
export function RuleCardsGrid({ rules }: { rules: RuleCardItem[] }) {
  const [activeLayer, setActiveLayer] = useState<(typeof LAYERS)[number]>('all');
  const [view, setView] = useViewPreference('ebright_rules_view');
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  const filtered = activeLayer === 'all' ? rules : rules.filter((r) => r.layer === activeLayer);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {LAYERS.map((l) => {
            const active = activeLayer === l;
            return (
              <button
                key={l}
                onClick={() => setActiveLayer(l)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  border: active ? 'none' : '1px solid #e5e7eb',
                  background: active ? '#dc2626' : '#ffffff',
                  color: active ? '#ffffff' : '#374151',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {LAYER_LABELS[l]}
              </button>
            );
          })}
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {activeLayer === 'promo' && filtered.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '10px', marginBottom: '32px' }}>
          No Promo rules — Promo is sent manually from the{' '}
          <a href="/promo" style={{ color: '#dc2626', fontWeight: 600 }}>
            Promo page
          </a>
          .
        </div>
      ) : view === 'list' ? (
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '32px' }}>
          {filtered.map((r) => {
            const expanded = expandedId === r.id;
            return (
              <div key={r.id} style={{ borderTop: '1px solid #f3f4f6', opacity: r.isActive ? 1 : 0.6 }}>
                <div
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpandedId(expanded ? null : r.id);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 16px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '15px', flexShrink: 0 }}>{r.display.icon}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', flexShrink: 0 }}>{r.display.label}</span>
                  <StatusBadge isActive={r.isActive} />
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#9ca3af',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {r.trigger}
                  </span>
                  <span style={{ fontSize: '11px', color: '#d1d5db', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
                </div>
                {expanded && (
                  <div style={{ padding: '0 16px 14px 41px', display: 'flex', gap: '24px', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Today</div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginTop: '2px' }}>{r.sentToday}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending</div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: r.pending > 0 ? '#f59e0b' : '#111827', marginTop: '2px' }}>
                        {r.pending}
                      </div>
                    </div>
                    {lastFiredLabel(r.lastFired) && (
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>Last fired: {lastFiredLabel(r.lastFired)}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', marginBottom: '32px' }}>
          {filtered.map((r) => (
            <div
              key={r.id}
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '16px',
                opacity: r.isActive ? 1 : 0.6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: r.display.color + '18',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      flexShrink: 0,
                    }}
                  >
                    {r.display.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{r.display.label}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{r.trigger}</div>
                  </div>
                </div>
                <StatusBadge isActive={r.isActive} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Today</div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginTop: '2px' }}>{r.sentToday}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending</div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: r.pending > 0 ? '#f59e0b' : '#111827', marginTop: '2px' }}>
                    {r.pending}
                  </div>
                </div>
              </div>

              {lastFiredLabel(r.lastFired) && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>Last fired: {lastFiredLabel(r.lastFired)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
