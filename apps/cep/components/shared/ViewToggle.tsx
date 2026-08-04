'use client';

import { useEffect, useState } from 'react';

export type ViewMode = 'grid' | 'list';

/**
 * Persists the grid/list view preference to localStorage per page (keyed so Rules
 * and Content library remember their choice independently). No existing
 * preference-persistence pattern exists elsewhere in the app to follow, so this
 * is a minimal, self-contained localStorage read/write — falls back to 'grid'
 * (unchanged default behavior) during SSR and before the client has mounted.
 */
export function useViewPreference(storageKey: string): [ViewMode, (v: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>('grid');

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'grid' || stored === 'list') setView(stored);
  }, [storageKey]);

  const update = (v: ViewMode) => {
    setView(v);
    window.localStorage.setItem(storageKey, v);
  };

  return [view, update];
}

const buttonStyle = (active: boolean): React.CSSProperties => ({
  width: '30px',
  height: '30px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '6px',
  border: active ? 'none' : '1px solid #e5e7eb',
  background: active ? '#dc2626' : '#ffffff',
  color: active ? '#ffffff' : '#9ca3af',
  cursor: 'pointer',
  fontSize: '14px',
});

export function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
      <button
        type="button"
        aria-label="Grid view"
        title="Grid view"
        onClick={() => onChange('grid')}
        style={buttonStyle(view === 'grid')}
      >
        ▦
      </button>
      <button
        type="button"
        aria-label="List view"
        title="List view"
        onClick={() => onChange('list')}
        style={buttonStyle(view === 'list')}
      >
        ☰
      </button>
    </div>
  );
}
