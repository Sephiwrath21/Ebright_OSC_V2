'use client';

import { useState } from 'react';
import { branchNumberPrefix } from '@/lib/branches';

interface BranchRow {
  id: string;
  name: string;
  isActive: boolean;
  parentCount: number;
}

/**
 * "Remove" never hard-deletes — it sets isActive: false via PATCH. Branch.id is
 * a required FK on every Parent record, so deleting a branch row would orphan
 * every parent/enrollment ever assigned to it. Deactivated branches drop out of
 * the Parents/Blast/Promo filter dropdowns but stay intact for historical data.
 */
export function BranchesClient({ initialBranches }: { initialBranches: BranchRow[] }) {
  const [branches, setBranches] = useState(initialBranches);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const refresh = async () => {
    const res = await fetch('/api/branches', { cache: 'no-store' });
    const rows: { id: string; name: string; isActive: boolean }[] = await res.json();
    setBranches((prev) =>
      rows.map((r) => ({ ...r, parentCount: prev.find((p) => p.id === r.id)?.parentCount ?? 0 })),
    );
  };

  const addBranch = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setBranches((prev) => [...prev, { ...j, parentCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const saveEdit = async (id: string) => {
    const name = editValue.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch(`/api/branches/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setBranches((prev) => prev.map((b) => (b.id === id ? { ...b, name: j.name } : b)));
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleActive = async (b: BranchRow) => {
    const res = await fetch(`/api/branches/${b.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: !b.isActive }),
    });
    if (res.ok) {
      setBranches((prev) => prev.map((row) => (row.id === b.id ? { ...row, isActive: !row.isActive } : row)));
    }
    await refresh();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addBranch()}
          placeholder="New branch name"
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid #e5e7eb',
            fontSize: '13px',
          }}
        />
        <button
          onClick={addBranch}
          disabled={adding || !newName.trim()}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: '#dc2626',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: adding || !newName.trim() ? 'not-allowed' : 'pointer',
            opacity: adding || !newName.trim() ? 0.6 : 1,
          }}
        >
          + Add branch
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '12px', padding: '10px', background: '#fee2e2', color: '#dc2626', borderRadius: '6px', fontSize: '12px' }}>
          {error}
        </div>
      )}

      <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 90px 140px', gap: '12px', padding: '10px 16px', fontSize: '10px', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 600, letterSpacing: '0.5px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          <div>#</div>
          <div>Name</div>
          <div>Parents</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {branches.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No branches yet.</div>
        )}
        {(() => {
          // Numbering only counts active branches (the same 01–23 sequence
          // shown in every filter dropdown) — deactivated/legacy branches are
          // still listed here for management, but don't consume a number.
          let activeIndex = -1;
          return branches.map((b) => {
            if (b.isActive) activeIndex++;
            const number = b.isActive ? branchNumberPrefix(activeIndex) : '—';
            return (
              <div
                key={b.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 100px 90px 140px',
                  gap: '12px',
                  padding: '10px 16px',
                  fontSize: '13px',
                  borderBottom: '1px solid #f3f4f6',
                  alignItems: 'center',
                  opacity: b.isActive ? 1 : 0.55,
                }}
              >
                <div style={{ color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{number}</div>
                {editingId === b.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(b.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #dc2626', fontSize: '13px', minWidth: 0 }}
                  />
                ) : (
                  <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                )}
                <div style={{ color: '#6b7280' }}>{b.parentCount}</div>
                <div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      background: b.isActive ? '#dcfce7' : '#f3f4f6',
                      color: b.isActive ? '#16a34a' : '#6b7280',
                    }}
                  >
                    {b.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {editingId === b.id ? (
                    <>
                      <button onClick={() => saveEdit(b.id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '12px', cursor: 'pointer', padding: 0 }}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(b.id);
                          setEditValue(b.name);
                        }}
                        style={{ background: 'none', border: 'none', color: '#374151', fontSize: '12px', cursor: 'pointer', padding: 0 }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(b)}
                        style={{ background: 'none', border: 'none', color: b.isActive ? '#dc2626' : '#16a34a', fontSize: '12px', cursor: 'pointer', padding: 0 }}
                      >
                        {b.isActive ? 'Remove' : 'Reactivate'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
