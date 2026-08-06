'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, GripVertical, Trash2, AlertTriangle, GitBranch, Layers, Users, Globe, Pencil, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import { useReadOnlyViewer } from '@/lib/crm/use-read-only-viewer'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stage {
  id: string
  name: string
  shortCode: string
  color: string
  order: number
  stuckHoursYellow: number
  stuckHoursRed: number
  /** Self-provisioned visibility flag — hidden stages drop off the kanban. */
  hidden?: boolean
  _count?: { opportunities: number }
}

interface Pipeline {
  id: string
  name: string
  stages: Stage[]
  /** The branch this pipeline belongs to — used to label + order the dropdown
   *  consistently with the topbar branch switcher ("01 …" → "23 …"). */
  branch?: { id: string; name: string }
}

/** Dropdown label: prefer the branch name (matches the topbar numbering) and
 *  fall back to the pipeline's own name. */
function pipelineLabel(p: Pipeline): string {
  return p.branch?.name ?? p.name
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchPipelines(): Promise<{ pipelines: Pipeline[]; canManageGlobal?: boolean }> {
  const res = await fetch('/api/crm/pipelines')
  if (!res.ok) throw new Error('Failed to fetch pipelines')
  return res.json()
}

// ─── Color swatches ───────────────────────────────────────────────────────────

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#64748b', '#000000', '#ffffff',
]

// ─── Stage row ────────────────────────────────────────────────────────────────

function StageRow({
  stage,
  index,
  onEdit,
  onToggleHidden,
  onDelete,
  readOnly = false,
}: {
  stage: Stage
  index: number
  onEdit: (stage: Stage) => void
  onToggleHidden: (stage: Stage) => void
  onDelete: (stage: Stage) => void
  readOnly?: boolean
}) {
  const hidden = !!stage.hidden

  return (
    <Draggable draggableId={stage.id} index={index} isDragDisabled={readOnly}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-shadow',
            'bg-white dark:bg-slate-900',
            hidden ? 'border-dashed border-slate-300 opacity-60 dark:border-slate-600' : 'border-slate-200 dark:border-slate-700',
            snapshot.isDragging && 'shadow-xl',
          )}
        >
          {/* Drag handle — hidden for read-only viewers */}
          {!readOnly && (
            <div
              {...provided.dragHandleProps}
              className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-500 transition-colors"
            >
              <GripVertical className="h-4 w-4" />
            </div>
          )}

          {/* Color dot */}
          <div
            className="h-6 w-6 shrink-0 rounded-full border-2 border-white shadow dark:border-slate-800"
            style={{ backgroundColor: stage.color }}
          />

          {/* Name (+ hidden badge) */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{stage.name}</span>
            {hidden && (
              <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                Hidden
              </span>
            )}
          </div>

          {/* Short code */}
          <span className="w-16 shrink-0 text-center font-mono text-xs uppercase text-slate-500 dark:text-slate-400">
            {stage.shortCode}
          </span>

          {/* Stuck hours (read-only display; edited in the popup) */}
          <div className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full bg-yellow-400" />
            <span className="w-8 text-center tabular-nums">{stage.stuckHoursYellow}h</span>
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <span className="w-8 text-center tabular-nums">{stage.stuckHoursRed}h</span>
          </div>

          {/* Opportunity count */}
          <div
            className="flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200"
            title="Opportunities currently in this stage"
          >
            <Users className="h-3 w-3" />
            <span className="font-mono">{stage._count?.opportunities ?? 0}</span>
          </div>

          {/* Actions — edit / hide-unhide / delete */}
          {!readOnly && (
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                onClick={() => onEdit(stage)}
                title="Edit stage"
                className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onToggleHidden(stage)}
                title={hidden ? 'Unhide stage' : 'Hide stage'}
                className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => onDelete(stage)}
                title="Delete stage"
                className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </Draggable>
  )
}

// ─── Edit stage popup ─────────────────────────────────────────────────────────

function EditStageModal({
  stage,
  onSave,
  onCancel,
  isPending,
}: {
  stage: Stage
  onSave: (data: { name: string; shortCode: string; color: string; stuckHoursYellow: number; stuckHoursRed: number }, applyAll: boolean) => void
  onCancel: () => void
  isPending?: boolean
}) {
  const [name, setName] = useState(stage.name)
  const [shortCode, setShortCode] = useState(stage.shortCode)
  const [color, setColor] = useState(stage.color)
  const [stuckY, setStuckY] = useState(stage.stuckHoursYellow)
  const [stuckR, setStuckR] = useState(stage.stuckHoursRed)
  const [applyAll, setApplyAll] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Edit stage</h3>

        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <label className="block">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Code</span>
            <input
              value={shortCode}
              onChange={(e) => setShortCode(e.target.value.toUpperCase().slice(0, 6))}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-center font-mono text-xs uppercase text-slate-600 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            />
          </label>
        </div>

        <div>
          <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Color</span>
          <div className="mt-1 grid grid-cols-12 gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn('h-6 w-6 rounded-full border-2 transition-transform hover:scale-110', color === c ? 'border-indigo-500' : 'border-transparent')}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-yellow-400" /> Yellow (hrs)
            </span>
            <input
              type="number"
              value={stuckY}
              onChange={(e) => setStuckY(parseInt(e.target.value) || 24)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <label className="block">
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-red-400" /> Red (hrs)
            </span>
            <input
              type="number"
              value={stuckR}
              onChange={(e) => setStuckR(parseInt(e.target.value) || 48)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 rounded-lg bg-indigo-50/60 px-3 py-2 text-xs text-slate-600 dark:bg-indigo-950/20 dark:text-slate-300">
          <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          <span>Apply to <strong>all branch pipelines</strong> (matched by code <span className="font-mono">{stage.shortCode}</span>)</span>
        </label>

        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            onClick={() => onSave({ name: name.trim(), shortCode: shortCode.trim(), color, stuckHoursYellow: stuckY, stuckHoursRed: stuckR }, applyAll)}
            disabled={isPending || !name.trim() || !shortCode.trim()}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteStageModal({
  stage,
  otherStages,
  oppCount,
  onConfirm,
  onCancel,
  isPending,
}: {
  stage: Stage
  otherStages: Stage[]
  oppCount: number
  onConfirm: (reassignToStageId: string | undefined, applyAll: boolean) => void
  onCancel: () => void
  isPending?: boolean
}) {
  const [reassignTo, setReassignTo] = useState('')
  const [applyAll, setApplyAll] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Delete &ldquo;{stage.name}&rdquo;?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {oppCount > 0
                ? `This stage has ${oppCount} active opportunities. Select a stage to move them to:`
                : 'Consider hiding the stage instead — deleting is permanent.'}
            </p>
          </div>
        </div>

        {oppCount > 0 && (
          <select
            value={reassignTo}
            onChange={(e) => setReassignTo(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Select target stage...</option>
            {otherStages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-2 rounded-lg bg-red-50/60 px-3 py-2 text-xs text-slate-600 dark:bg-red-950/20 dark:text-slate-300">
          <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          <span>Delete from <strong>all branch pipelines</strong> (matched by code <span className="font-mono">{stage.shortCode}</span>)</span>
        </label>

        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reassignTo || undefined, applyAll)}
            disabled={isPending || (oppCount > 0 && !reassignTo)}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete stage
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add stage form ───────────────────────────────────────────────────────────

function AddStageForm({
  pipelineId,
  onSuccess,
}: {
  pipelineId: string
  onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [shortCode, setShortCode] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!name.trim() || !shortCode.trim()) {
      toast.error('Name and short code are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/crm/pipelines/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineId, name, shortCode }),
      })
      if (!res.ok) throw new Error('Failed to add stage')
      toast.success('Stage added')
      setName('')
      setShortCode('')
      onSuccess()
    } catch {
      toast.error('Failed to add stage')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2 pt-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Stage name"
        className="flex-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
      />
      <input
        value={shortCode}
        onChange={(e) => setShortCode(e.target.value.toUpperCase().slice(0, 6))}
        placeholder="CODE"
        className="w-20 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-xs font-mono uppercase text-slate-600 dark:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center placeholder:text-slate-400"
      />
      <button
        onClick={handleAdd}
        disabled={saving}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add
      </button>
    </div>
  )
}

// ─── Global (all-branches) stage panel — SUPER_ADMIN / AGENCY_ADMIN only ───────

function GlobalStagePanel({
  pipelines,
  onChanged,
}: {
  pipelines: Pipeline[]
  onChanged: () => void
}) {
  // Canonical stage list (pipelines are uniform across branches) for the selects.
  const stages = [...(pipelines[0]?.stages ?? [])].sort((a, b) => a.order - b.order)

  const [name, setName] = useState('')
  const [shortCode, setShortCode] = useState('')
  const [beforeShortCode, setBeforeShortCode] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [adding, setAdding] = useState(false)

  const [delCode, setDelCode] = useState('')
  const [reassignTo, setReassignTo] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function handleAdd() {
    if (!name.trim() || !shortCode.trim()) { toast.error('Name and short code are required'); return }
    setAdding(true)
    try {
      const res = await fetch('/api/crm/pipelines/global-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, shortCode, color, beforeShortCode: beforeShortCode || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add stage')
      toast.success(`Added "${name}" to ${json.created} pipeline(s)${json.skipped ? `, ${json.skipped} already had it` : ''}`)
      setName(''); setShortCode(''); setBeforeShortCode('')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add stage')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete() {
    if (!delCode) { toast.error('Pick a stage to delete'); return }
    if (!window.confirm(`Delete "${delCode}" from ALL branch pipelines? Any opportunities there will move to "${reassignTo || '—'}".`)) return
    setDeleting(true)
    try {
      const res = await fetch('/api/crm/pipelines/global-stage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortCode: delCode, reassignToShortCode: reassignTo || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete stage')
      toast.success(`Deleted "${delCode}" from ${json.deleted} pipeline(s); reassigned ${json.reassigned} opportunities`)
      setDelCode(''); setReassignTo('')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete stage')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">All Branches</h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">— add or remove a stage across every branch pipeline at once</span>
      </div>

      {/* Add across all branches */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Stage name"
          className="flex-1 min-w-40 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
        />
        <input
          value={shortCode}
          onChange={(e) => setShortCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="CODE"
          className="w-20 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono uppercase text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center placeholder:text-slate-400"
        />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 dark:text-slate-400">before</span>
          <select
            value={beforeShortCode}
            onChange={(e) => setBeforeShortCode(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">(end)</option>
            {stages.map((s) => (
              <option key={s.id} value={s.shortCode}>{s.name} ({s.shortCode})</option>
            ))}
          </select>
        </div>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          title="Stage color"
          className="h-9 w-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5 cursor-pointer"
        />
        <button
          onClick={handleAdd}
          disabled={adding}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add to all
        </button>
      </div>

      {/* Delete across all branches */}
      <div className="flex flex-wrap items-center gap-2 border-t border-indigo-200/60 dark:border-indigo-900/60 pt-3">
        <span className="text-xs text-slate-500 dark:text-slate-400">Delete</span>
        <select
          value={delCode}
          onChange={(e) => setDelCode(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <option value="">Select stage…</option>
          {stages.map((s) => (
            <option key={s.id} value={s.shortCode}>{s.name} ({s.shortCode})</option>
          ))}
        </select>
        <span className="text-xs text-slate-500 dark:text-slate-400">move its leads to</span>
        <select
          value={reassignTo}
          onChange={(e) => setReassignTo(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <option value="">(none — only if empty)</option>
          {stages.filter((s) => s.shortCode !== delCode).map((s) => (
            <option key={s.id} value={s.shortCode}>{s.name} ({s.shortCode})</option>
          ))}
        </select>
        <button
          onClick={handleDelete}
          disabled={deleting || !delCode}
          className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete from all
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PipelinesPage() {
  const readOnly = useReadOnlyViewer()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['crm', 'pipelines'],
    queryFn: fetchPipelines,
  })

  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('')
  const [pendingDelete, setPendingDelete] = useState<Stage | null>(null)
  const [editingStage, setEditingStage] = useState<Stage | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Order branches the same way the topbar switcher does: numerically by the
  // "NN …" prefix of the BRANCH name, not the pipeline's own (region-order) name.
  const pipelines = [...(data?.pipelines ?? [])].sort((a, b) =>
    pipelineLabel(a).localeCompare(pipelineLabel(b), undefined, { numeric: true }),
  )
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? pipelines[0]
  const [stages, setStages] = useState<Stage[]>([])

  // Sync stages when pipeline or pipeline data changes
  useEffect(() => {
    if (selectedPipeline?.stages) {
      setStages([...selectedPipeline.stages].sort((a, b) => a.order - b.order))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPipelineId, data])

  const onDragEnd = useCallback(
    async (result: DropResult) => {
      if (!result.destination || result.source.index === result.destination.index) return

      const newStages = Array.from(stages)
      const [moved] = newStages.splice(result.source.index, 1)
      newStages.splice(result.destination.index, 0, moved)
      setStages(newStages)

      try {
        const res = await fetch('/api/crm/pipelines/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipelineId: selectedPipeline?.id,
            orderedStageIds: newStages.map((s) => s.id),
          }),
        })
        if (!res.ok) throw new Error('Reorder failed')
        void qc.invalidateQueries({ queryKey: ['crm', 'pipelines'] })
      } catch {
        toast.error('Failed to reorder stages')
        void refetch()
      }
    },
    [stages, selectedPipeline, qc, refetch],
  )

  // Save a stage edit from the popup — one pipeline, or (applyAll) every branch
  // pipeline sharing the stage's short code.
  async function handleEditSave(
    stage: Stage,
    data: { name: string; shortCode: string; color: string; stuckHoursYellow: number; stuckHoursRed: number },
    applyAll: boolean,
  ) {
    setSavingEdit(true)
    try {
      const res = applyAll
        ? await fetch('/api/crm/pipelines/global-stage', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            // Match by the stage's ORIGINAL code; the code itself can't be
            // rewritten across all pipelines from here (it's the match key).
            body: JSON.stringify({ shortCode: stage.shortCode, name: data.name, color: data.color, stuckHoursYellow: data.stuckHoursYellow, stuckHoursRed: data.stuckHoursRed }),
          })
        : await fetch(`/api/crm/pipelines/stage/${stage.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to update stage')
      toast.success(applyAll ? 'Stage updated across all branches' : 'Stage updated')
      setEditingStage(null)
      void qc.invalidateQueries({ queryKey: ['crm', 'pipelines'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update stage')
    } finally {
      setSavingEdit(false)
    }
  }

  // Hide / unhide a single stage (eye icon). Hidden stages drop off the kanban
  // but keep their data — a reversible alternative to delete.
  async function handleToggleHidden(stage: Stage) {
    const next = !stage.hidden
    try {
      const res = await fetch(`/api/crm/pipelines/stage/${stage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: next }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success(next ? 'Stage hidden' : 'Stage shown')
      void qc.invalidateQueries({ queryKey: ['crm', 'pipelines'] })
    } catch {
      toast.error(`Failed to ${next ? 'hide' : 'show'} stage`)
    }
  }

  async function handleDeleteStage(stage: Stage, reassignToStageId: string | undefined, applyAll: boolean) {
    setDeleting(true)
    try {
      const reassignCode = reassignToStageId ? stages.find((s) => s.id === reassignToStageId)?.shortCode : undefined
      const res = applyAll
        ? await fetch('/api/crm/pipelines/global-stage', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shortCode: stage.shortCode, reassignToShortCode: reassignCode }),
          })
        : await fetch(`/api/crm/pipelines/stage/${stage.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reassignToStageId }),
          })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Delete failed')
      toast.success(applyAll ? 'Stage deleted across all branches' : 'Stage deleted')
      void qc.invalidateQueries({ queryKey: ['crm', 'pipelines'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete stage')
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  const totalStages = stages.length
  const totalOpportunities = stages.reduce((s, st) => s + (st._count?.opportunities ?? 0), 0)
  const largestStage = stages.reduce(
    (top, s) => ((s._count?.opportunities ?? 0) > (top?._count?.opportunities ?? 0) ? s : top),
    undefined as Stage | undefined,
  )

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Pipelines</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage pipeline stages, their order, and stale-deal thresholds.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <PipelineStat icon={GitBranch} label="Pipelines"    value={pipelines.length} tint="indigo" />
        <PipelineStat icon={Layers}    label="Stages"       value={totalStages}      tint="blue"   />
        <PipelineStat icon={Users}     label="Opportunities" value={totalOpportunities} tint="emerald"
          sublabel={largestStage ? `Most in "${largestStage.name}"` : undefined} />
      </div>

      {/* Pipeline selector */}
      {pipelines.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Pipeline</label>
          <select
            value={selectedPipelineId || selectedPipeline?.id || ''}
            onChange={(e) => {
              setSelectedPipelineId(e.target.value)
              const p = pipelines.find((pl) => pl.id === e.target.value)
              if (p) setStages([...p.stages].sort((a, b) => a.order - b.order))
            }}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{pipelineLabel(p)}</option>
            ))}
          </select>
          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            {selectedPipeline ? `${selectedPipeline.stages.length} stages` : ''}
          </span>
        </div>
      )}

      {/* Column headers */}
      {selectedPipeline && stages.length > 0 && (
        <div className="flex items-center gap-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span className="w-4" />
          <span className="w-6" />
          <span className="flex-1">Stage Name</span>
          <span className="w-16 text-center">Code</span>
          <span className="flex w-[calc(2*(2.75rem+0.375rem)+0.375rem)] shrink-0 items-center justify-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
            <span>Yellow</span>
            <span className="mx-1">/</span>
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            <span>Red (hrs)</span>
          </span>
          <span className="w-14 text-center">Opps</span>
          <span className="w-7" />
        </div>
      )}

      {/* Stages */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : isError ? (
          <div className="text-center py-10 text-sm text-slate-500">
            Failed to load pipelines.
            <button onClick={() => refetch()} className="ml-2 text-indigo-600 hover:underline">Retry</button>
          </div>
        ) : !selectedPipeline ? (
          <div className="text-center py-10 text-sm text-slate-400">
            No pipelines found. Create one from the Opportunities page.
          </div>
        ) : stages.length === 0 ? (
          <div className="text-center py-6 text-sm text-slate-400">
            No stages yet. Add one below.
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="stages" type="STAGE">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="space-y-2"
                >
                  {stages.map((stage, index) => (
                    <StageRow
                      key={stage.id}
                      stage={stage}
                      index={index}
                      readOnly={readOnly}
                      onEdit={setEditingStage}
                      onToggleHidden={handleToggleHidden}
                      onDelete={setPendingDelete}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}

        {selectedPipeline && !readOnly && (
          <AddStageForm
            pipelineId={selectedPipeline.id}
            onSuccess={() => {
              void refetch()
            }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-yellow-400" />
          <span>Yellow threshold (hours)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-red-400" />
          <span>Red threshold (hours)</span>
        </div>
        <span className="ml-auto">Drag rows to reorder</span>
      </div>

      {/* All-branches global stage management (elevated roles only) */}
      {data?.canManageGlobal && pipelines.length > 0 && (
        <GlobalStagePanel
          pipelines={pipelines}
          onChanged={() => { void refetch() }}
        />
      )}

      {/* Edit popup */}
      {editingStage && (
        <EditStageModal
          stage={editingStage}
          onSave={(data, applyAll) => handleEditSave(editingStage, data, applyAll)}
          onCancel={() => setEditingStage(null)}
          isPending={savingEdit}
        />
      )}

      {/* Delete modal */}
      {pendingDelete && (
        <DeleteStageModal
          stage={pendingDelete}
          otherStages={stages.filter((s) => s.id !== pendingDelete.id)}
          oppCount={pendingDelete._count?.opportunities ?? 0}
          onConfirm={(reassignToStageId, applyAll) => handleDeleteStage(pendingDelete, reassignToStageId, applyAll)}
          onCancel={() => setPendingDelete(null)}
          isPending={deleting}
        />
      )}
    </div>
  )
}

// ─── Pipeline stat card ───────────────────────────────────────────────────────

const P_TINTS = {
  indigo:  'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400',
  blue:    'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
} as const

function PipelineStat({
  icon: Icon,
  label,
  value,
  sublabel,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  sublabel?: string
  tint: keyof typeof P_TINTS
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', P_TINTS[tint])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
        <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
        {sublabel && (
          <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{sublabel}</div>
        )}
      </div>
    </div>
  )
}
