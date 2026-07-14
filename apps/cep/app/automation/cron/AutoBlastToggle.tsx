'use client';

import { useCallback, useEffect, useState } from 'react';

interface AutoBlastToggleProps {
  initialEnabled: boolean;
  /** ISO timestamp of the scheduler's next real tick, from lib/cronSettings.ts#getNextTickAt. */
  initialNextTickAt: string;
}

/**
 * Real Start/Stop kill switch for the day-based automation scheduler
 * (lib/cronScheduler.ts). Unlike the old RunCronButton, this does NOT run
 * anything client-side — the server ticks every 60s on its own and checks
 * AutomationSettings.cronEnabled (via /api/admin/cron-settings) before
 * firing. This toggle just flips that persisted flag, so it takes effect
 * immediately and survives page close / server restart.
 *
 * The "next check in ~Ns" countdown is a passive display only — it never
 * calls /api/cron/run itself. It resyncs against the server's real next-tick
 * time (derived from the cron pattern, not tracked timer state) whenever the
 * countdown reaches zero or the tab regains focus, so backgrounded-tab drift
 * self-corrects instead of accumulating.
 */
export function AutoBlastToggle({ initialEnabled, initialNextTickAt }: AutoBlastToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [nextTickAt, setNextTickAt] = useState(() => new Date(initialNextTickAt).getTime());
  // Deliberately NOT computed from Date.now() here — that would run once at
  // SSR time and again at client hydration time (a few hundred ms to a few
  // seconds later), giving two different numbers for the same markup and
  // triggering a hydration mismatch. Starting from null keeps the server and
  // first client render identical; the real value is filled in below by an
  // effect, which only runs after hydration.
  const [secsLeft, setSecsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSecsLeft(Math.max(0, Math.round((nextTickAt - Date.now()) / 1000)));
  }, [nextTickAt]);

  const resync = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cron-settings', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setEnabled(data.enabled);
      if (data.nextTickAt) setNextTickAt(new Date(data.nextTickAt).getTime());
    } catch {
      // transient network error — keep showing the last known state until the next resync
    }
  }, []);

  // Tab was backgrounded and just regained focus — pull the real state instead of
  // trusting whatever the client setInterval drifted to while inactive.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') resync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [resync]);

  // Passive 1s display tick. Re-created only when nextTickAt/enabled actually change
  // (i.e. once a minute), not every second — so this never itself fires a cron run.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const remaining = Math.round((nextTickAt - Date.now()) / 1000);
      if (remaining <= 0) {
        resync(); // the real tick just happened server-side; pull the fresh next time
      } else {
        setSecsLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, nextTickAt, resync]);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/cron-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setEnabled(data.enabled);
      if (data.nextTickAt) setNextTickAt(new Date(data.nextTickAt).getTime());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            padding: '4px 12px',
            borderRadius: '999px',
            background: enabled ? '#dcfce7' : '#f3f4f6',
            color: enabled ? '#16a34a' : '#6b7280',
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: enabled ? '#22c55e' : '#9ca3af',
              display: 'inline-block',
            }}
          />
          {enabled ? 'Running' : 'Stopped'}
        </span>
        <span style={{ fontSize: '11px', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
          {!enabled ? 'no checks scheduled' : secsLeft === null ? 'next check in …' : `next check in ~${secsLeft}s`}
        </span>
        <button
          onClick={toggle}
          disabled={busy}
          style={{
            padding: '8px 18px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 600,
            fontSize: '13px',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
            background: enabled ? '#fee2e2' : '#ef4444',
            color: enabled ? '#dc2626' : '#ffffff',
            transition: 'background 0.2s',
          }}
        >
          {busy ? 'Updating…' : enabled ? '⏹ Stop auto-blast' : '▶ Start auto-blast'}
        </button>
      </div>
      <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'right', maxWidth: '280px' }}>
        {enabled
          ? 'Real automation is running — day-based rules fire automatically every minute as they become due.'
          : 'Auto-blast stopped — no checks scheduled. Nothing will send automatically until this is turned back on.'}
      </div>
      {error && <div style={{ fontSize: '11px', color: '#dc2626' }}>{error}</div>}
    </div>
  );
}
