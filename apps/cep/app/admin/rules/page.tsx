'use client';

import { useEffect, useState } from 'react';
import { PLAN_TYPES, PLAN_TYPE_LABELS } from '@/lib/planTypes';

interface FestiveEvent {
  id: string;
  name: string;
  slug: string;
  date: string;
  endDate: string | null;
  sendOnDay: boolean;
  sendPreDays: number | null;
  branch: string | null;
  isActive: boolean;
  source: 'manual' | 'cal_com';
  syncedAt: string | null;
}

interface ShowcaseEvent {
  id: string;
  name: string;
  slug: string;
  date: string;
  branch: string | null;
  isActive: boolean;
  source: 'manual' | 'cal_com';
  syncedAt: string | null;
}

interface Trigger {
  id: number;
  planType: string;
  triggerDay: number;
  triggerRelativeTo: string;
}

interface Rule {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  triggers: Trigger[];
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: '6px',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  background: '#fff',
  color: '#111827',
};

export default function AdminRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRuleName, setNewRuleName] = useState('');
  const [festiveEvents, setFestiveEvents] = useState<FestiveEvent[]>([]);
  const [festiveLoading, setFestiveLoading] = useState(true);
  const [showcaseEvents, setShowcaseEvents] = useState<ShowcaseEvent[]>([]);
  const [showcaseLoading, setShowcaseLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/rules', { cache: 'no-store' });
      setRules(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const loadFestive = async () => {
    setFestiveLoading(true);
    try {
      const res = await fetch('/api/admin/festive', { cache: 'no-store' });
      setFestiveEvents(await res.json());
    } finally {
      setFestiveLoading(false);
    }
  };

  const loadShowcase = async () => {
    setShowcaseLoading(true);
    try {
      const res = await fetch('/api/admin/showcase', { cache: 'no-store' });
      setShowcaseEvents(await res.json());
    } finally {
      setShowcaseLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadFestive();
    loadShowcase();
  }, []);

  const createFestiveEvent = async (input: {
    name: string;
    date: string;
    endDate: string;
    sendOnDay: boolean;
    sendPreDays: string;
    branch: string;
  }) => {
    await fetch('/api/admin/festive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        date: input.date,
        endDate: input.endDate || null,
        sendOnDay: input.sendOnDay,
        sendPreDays: input.sendPreDays,
        branch: input.branch || null,
      }),
    });
    await loadFestive();
  };

  const updateFestiveEvent = async (id: string, patch: Partial<FestiveEvent>) => {
    await fetch(`/api/admin/festive/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await loadFestive();
  };

  const deleteFestiveEvent = async (evt: FestiveEvent) => {
    if (!confirm(`Delete festive event "${evt.name}"?`)) return;
    await fetch(`/api/admin/festive/${evt.id}`, { method: 'DELETE' });
    await loadFestive();
  };

  const createShowcaseEvent = async (input: { name: string; date: string; branch: string }) => {
    await fetch('/api/admin/showcase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.name, date: input.date, branch: input.branch || null }),
    });
    await loadShowcase();
  };

  const updateShowcaseEvent = async (id: string, patch: Partial<ShowcaseEvent>) => {
    await fetch(`/api/admin/showcase/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await loadShowcase();
  };

  const deleteShowcaseEvent = async (evt: ShowcaseEvent) => {
    if (!confirm(`Delete showcase event "${evt.name}"?`)) return;
    await fetch(`/api/admin/showcase/${evt.id}`, { method: 'DELETE' });
    await loadShowcase();
  };

  const syncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/admin/calcom/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSyncResult(
        data.festive?.ranSync || data.showcase?.ranSync
          ? `Festivals: synced ${data.festive.synced} · canceled ${data.festive.canceled} — Showcases: synced ${data.showcase.synced} · canceled ${data.showcase.canceled}`
          : 'Not configured — see .env',
      );
      await Promise.all([loadFestive(), loadShowcase()]);
    } catch (err) {
      setSyncResult(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const createRule = async () => {
    if (!newRuleName.trim()) return;
    await fetch('/api/admin/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newRuleName.trim() }),
    });
    setNewRuleName('');
    await load();
  };

  const toggleActive = async (rule: Rule) => {
    await fetch(`/api/admin/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    await load();
  };

  const deleteRule = async (rule: Rule) => {
    if (!confirm(`Delete rule "${rule.name}" and all its triggers?`)) return;
    await fetch(`/api/admin/rules/${rule.id}`, { method: 'DELETE' });
    await load();
  };

  const addTrigger = async (ruleId: number, planType: string, triggerDay: number, triggerRelativeTo: string) => {
    await fetch(`/api/admin/rules/${ruleId}/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planType, triggerDay, triggerRelativeTo }),
    });
    await load();
  };

  const deleteTrigger = async (ruleId: number, triggerId: number) => {
    await fetch(`/api/admin/rules/${ruleId}/triggers/${triggerId}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Automation rules admin</h1>
      <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 20px' }}>
        Configure each rule&apos;s per-plan trigger days. This is the config table lib/cron.ts reads from —
        no code changes needed to adjust cadences.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <input
          value={newRuleName}
          onChange={(e) => setNewRuleName(e.target.value)}
          placeholder="New rule name (e.g. renewal)"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={createRule}
          style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
        >
          + Add rule
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={() => toggleActive(rule)}
              onDelete={() => deleteRule(rule)}
              onAddTrigger={(planType, day, rel) => addTrigger(rule.id, planType, day, rel)}
              onDeleteTrigger={(triggerId) => deleteTrigger(rule.id, triggerId)}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: '36px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Festive rule</h2>
            <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 20px', maxWidth: '640px' }}>
              Malaysian festive greetings (Hari Raya, CNY, Deepavali, Christmas, etc). These trigger off a calendar
              date shared by all parents, not enrollment date. Dates marked <strong>🔗 Cal.com</strong> below sync
              automatically (~daily) from Cal.com bookings titled &quot;Festive: ...&quot; and can&apos;t be
              hand-edited here — change the booking in Cal.com instead. Rows without that badge are manual entries,
              editable freely. Sent to all active parents regardless of festival.
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <button
              onClick={syncNow}
              disabled={syncing}
              style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.6 : 1 }}
            >
              {syncing ? 'Syncing…' : '🔄 Sync Cal.com now'}
            </button>
            {syncResult && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', maxWidth: '260px' }}>{syncResult}</div>}
          </div>
        </div>

        <FestiveEventForm onCreate={createFestiveEvent} />

        {festiveLoading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
        ) : festiveEvents.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '10px' }}>
            No festive events yet. Add one above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            {festiveEvents.map((evt) => (
              <FestiveEventRow
                key={evt.id}
                evt={evt}
                onToggleActive={() => updateFestiveEvent(evt.id, { isActive: !evt.isActive })}
                onDelete={() => deleteFestiveEvent(evt)}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: '36px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Showcase rule</h2>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 20px', maxWidth: '640px' }}>
          One-off branch/company showcases. Dates marked <strong>🔗 Cal.com</strong> below sync automatically
          (~daily) from Cal.com bookings titled &quot;Showcase: ...&quot; (use the same Sync button above). Unlike
          festivals, a showcase with no matching Content library template does <strong>not</strong> fall back to a
          generic message — it simply won&apos;t send, and an admin reminder escalates as the date gets within 7 days.
        </p>

        <ShowcaseEventForm onCreate={createShowcaseEvent} />

        {showcaseLoading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
        ) : showcaseEvents.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '10px' }}>
            No showcase events yet. Add one above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            {showcaseEvents.map((evt) => (
              <ShowcaseEventRow
                key={evt.id}
                evt={evt}
                onToggleActive={() => updateShowcaseEvent(evt.id, { isActive: !evt.isActive })}
                onDelete={() => deleteShowcaseEvent(evt)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  onToggle,
  onDelete,
  onAddTrigger,
  onDeleteTrigger,
}: {
  rule: Rule;
  onToggle: () => void;
  onDelete: () => void;
  onAddTrigger: (planType: string, triggerDay: number, triggerRelativeTo: string) => void;
  onDeleteTrigger: (triggerId: number) => void;
}) {
  const [planType, setPlanType] = useState<string>(PLAN_TYPES[0]);
  const [triggerDay, setTriggerDay] = useState('0');
  const [triggerRelativeTo, setTriggerRelativeTo] = useState('start');

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>{rule.name}</div>
          {rule.description && <div style={{ fontSize: '12px', color: '#9ca3af' }}>{rule.description}</div>}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            onClick={onToggle}
            style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: '999px',
              background: rule.isActive ? '#dcfce7' : '#f3f4f6',
              color: rule.isActive ? '#16a34a' : '#6b7280',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {rule.isActive ? 'Active' : 'Paused'}
          </span>
          <button
            onClick={onDelete}
            style={{ background: 'transparent', border: '1px solid #fee2e2', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', color: '#dc2626', cursor: 'pointer' }}
          >
            Delete rule
          </button>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ color: '#9ca3af', textAlign: 'left' }}>
            <th style={{ padding: '4px 6px', fontWeight: 500 }}>Plan</th>
            <th style={{ padding: '4px 6px', fontWeight: 500 }}>Relative to</th>
            <th style={{ padding: '4px 6px', fontWeight: 500 }}>Day</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rule.triggers.map((t) => (
            <tr key={t.id} style={{ borderTop: '1px solid #f3f4f6' }}>
              <td style={{ padding: '4px 6px' }}>{PLAN_TYPE_LABELS[t.planType] ?? t.planType}</td>
              <td style={{ padding: '4px 6px' }}>{t.triggerRelativeTo === 'end' ? 'before expiry' : 'after enrollment'}</td>
              <td style={{ padding: '4px 6px' }}>{t.triggerDay}</td>
              <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                <button
                  onClick={() => onDeleteTrigger(t.id)}
                  style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '11px' }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center' }}>
        <select value={planType} onChange={(e) => setPlanType(e.target.value)} className="ebright-select" style={{ width: 'auto' }}>
          {PLAN_TYPES.map((p) => (
            <option key={p} value={p}>
              {PLAN_TYPE_LABELS[p]}
            </option>
          ))}
        </select>
        <select value={triggerRelativeTo} onChange={(e) => setTriggerRelativeTo(e.target.value)} className="ebright-select" style={{ width: 'auto' }}>
          <option value="start">days after enrollment</option>
          <option value="end">days before expiry</option>
        </select>
        <input
          type="number"
          min={0}
          value={triggerDay}
          onChange={(e) => setTriggerDay(e.target.value)}
          style={{ ...inputStyle, width: '60px' }}
        />
        <button
          onClick={() => onAddTrigger(planType, Number(triggerDay), triggerRelativeTo)}
          style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}
        >
          + Add trigger
        </button>
      </div>
    </div>
  );
}

function FestiveEventForm({
  onCreate,
}: {
  onCreate: (input: {
    name: string;
    date: string;
    endDate: string;
    sendOnDay: boolean;
    sendPreDays: string;
    branch: string;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sendOnDay, setSendOnDay] = useState(true);
  const [sendPreDays, setSendPreDays] = useState('');
  const [branch, setBranch] = useState('');

  const submit = () => {
    if (!name.trim() || !date) return;
    onCreate({ name: name.trim(), date, endDate, sendOnDay, sendPreDays, branch });
    setName('');
    setDate('');
    setEndDate('');
    setSendOnDay(true);
    setSendPreDays('');
    setBranch('');
  };

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Festival name (e.g. Hari Raya Aidilfitri)"
          style={{ ...inputStyle, flex: '1 1 220px' }}
        />
        <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px', color: '#9ca3af' }}>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px', color: '#9ca3af' }}>
          End date (optional, e.g. CNY day 2)
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px', color: '#9ca3af' }}>
          Pre-festival, H-days (optional)
          <input
            type="number"
            min={0}
            value={sendPreDays}
            onChange={(e) => setSendPreDays(e.target.value)}
            placeholder="e.g. 3"
            style={{ ...inputStyle, width: '90px' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px', color: '#9ca3af' }}>
          Branch (optional)
          <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="all branches" style={{ ...inputStyle, width: '140px' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#374151' }}>
          <input type="checkbox" checked={sendOnDay} onChange={(e) => setSendOnDay(e.target.checked)} />
          Send on-the-day
        </label>
        <button
          onClick={submit}
          style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
        >
          + Add festival
        </button>
      </div>
    </div>
  );
}

function FestiveEventRow({
  evt,
  onToggleActive,
  onDelete,
}: {
  evt: FestiveEvent;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  const timing = [
    evt.sendOnDay ? 'on-the-day' : null,
    evt.sendPreDays != null ? `H-${evt.sendPreDays}` : null,
  ]
    .filter(Boolean)
    .join(' + ') || 'none';

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{evt.name}</span>
          {evt.source === 'cal_com' ? (
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', background: '#eff6ff', color: '#1d4ed8' }}>
              🔗 Cal.com
            </span>
          ) : (
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', background: '#f3f4f6', color: '#6b7280' }}>
              ✏️ Manual
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
          {fmt(evt.date)}
          {evt.endDate ? ` – ${fmt(evt.endDate)}` : ''} · sends: {timing} · {evt.branch ?? 'all branches'}
          {evt.syncedAt ? ` · synced ${fmt(evt.syncedAt)}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span
          onClick={onToggleActive}
          style={{
            fontSize: '10px',
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: '999px',
            background: evt.isActive ? '#dcfce7' : '#f3f4f6',
            color: evt.isActive ? '#16a34a' : '#6b7280',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {evt.isActive ? 'Active' : 'Paused'}
        </span>
        <button
          onClick={onDelete}
          style={{ background: 'transparent', border: '1px solid #fee2e2', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', color: '#dc2626', cursor: 'pointer' }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ShowcaseEventForm({
  onCreate,
}: {
  onCreate: (input: { name: string; date: string; branch: string }) => void;
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [branch, setBranch] = useState('');

  const submit = () => {
    if (!name.trim() || !date) return;
    onCreate({ name: name.trim(), date, branch });
    setName('');
    setDate('');
    setBranch('');
  };

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Showcase name (e.g. Puchong Branch Q3 Showcase)"
          style={{ ...inputStyle, flex: '1 1 260px' }}
        />
        <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px', color: '#9ca3af' }}>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px', color: '#9ca3af' }}>
          Branch (optional)
          <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="all branches" style={{ ...inputStyle, width: '140px' }} />
        </label>
        <button
          onClick={submit}
          style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
        >
          + Add showcase
        </button>
      </div>
    </div>
  );
}

function ShowcaseEventRow({
  evt,
  onToggleActive,
  onDelete,
}: {
  evt: ShowcaseEvent;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{evt.name}</span>
          {evt.source === 'cal_com' ? (
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', background: '#eff6ff', color: '#1d4ed8' }}>
              🔗 Cal.com
            </span>
          ) : (
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', background: '#f3f4f6', color: '#6b7280' }}>
              ✏️ Manual
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
          {fmt(evt.date)} · {evt.branch ?? 'all branches'}
          {evt.syncedAt ? ` · synced ${fmt(evt.syncedAt)}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span
          onClick={onToggleActive}
          style={{
            fontSize: '10px',
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: '999px',
            background: evt.isActive ? '#dcfce7' : '#f3f4f6',
            color: evt.isActive ? '#16a34a' : '#6b7280',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {evt.isActive ? 'Active' : 'Paused'}
        </span>
        <button
          onClick={onDelete}
          style={{ background: 'transparent', border: '1px solid #fee2e2', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', color: '#dc2626', cursor: 'pointer' }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
