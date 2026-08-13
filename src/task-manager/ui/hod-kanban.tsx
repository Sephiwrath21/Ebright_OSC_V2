"use client";

// OSC integration package — an HOD's own freeform personal board ("My
// Board"). This is explicitly NOT the task system: no RunBlock/FlowRun, no
// assignee, no completion engine — just cards the HOD creates for their own
// notes/reminders. Every column (including the initial Pending/In Progress/
// Completed set a new HOD starts with) is a fully equal, ordinary row —
// renamable, deletable, and freely reorderable via drag, nothing pinned.
//
// Two layers of dnd-kit sortable, one DndContext: cards reorder/move WITHIN
// and BETWEEN columns (existing layer, unchanged), and columns themselves
// reorder along the row (new). Each draggable item carries a `data: {type}`
// tag so onDragEnd can tell which layer is in play — a column's own drag
// handle is a small dedicated grip icon, not the whole column (same lesson
// already learned in ceo-dashboard.tsx: attaching listeners to an entire
// card/column fights with clicks on things inside it).

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  HOD_KANBAN_COLORS,
  type ActionResult,
  type FlowKanbanCard,
  type FlowKanbanColumnColor,
  type FlowKanbanColumnDef,
} from "./types";

export interface HodKanbanActions {
  create: (column: string, title: string) => Promise<ActionResult>;
  move: (cardId: string, column: string, order: number) => Promise<ActionResult>;
  remove: (cardId: string) => Promise<ActionResult>;
  createColumn: (label: string) => Promise<ActionResult>;
  renameColumn: (columnId: string, label: string) => Promise<ActionResult>;
  moveColumn: (columnId: string, order: number) => Promise<ActionResult>;
  /** Resolves { ok: false } (e.g. "column isn't empty") if the delete is
   *  rejected — the column view shows that message inline rather than
   *  silently no-op'ing. */
  deleteColumn: (columnId: string) => Promise<ActionResult>;
  /** null resets the column title back to its default neutral color. */
  recolorColumn: (columnId: string, color: FlowKanbanColumnColor | null) => Promise<ActionResult>;
}

/** Column title color treatment — text-only per the design (the column
 *  body/background stays neutral, just the label picks up the accent). */
const COLUMN_TITLE_COLOR: Record<FlowKanbanColumnColor, string> = {
  blue: "text-blue-600 dark:text-blue-400",
  indigo: "text-indigo-600 dark:text-indigo-400",
  violet: "text-violet-600 dark:text-violet-400",
  pink: "text-pink-600 dark:text-pink-400",
  orange: "text-orange-600 dark:text-orange-400",
  teal: "text-teal-600 dark:text-teal-400",
  rose: "text-rose-600 dark:text-rose-400",
};

const COLUMN_SWATCH_DOT: Record<FlowKanbanColumnColor, string> = {
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
  orange: "bg-orange-500",
  teal: "bg-teal-500",
  rose: "bg-rose-500",
};

/** The swatch-dot trigger + its popover — click the dot to pick one of the
 *  preset colors, or the dashed "reset" swatch to go back to neutral. Same
 *  hand-rolled outside-click/Escape-to-close pattern as MemberDropdown in
 *  recipient-picker.tsx (no popover/dropdown library in this package). */
function ColumnColorPicker({
  color,
  onPick,
}: {
  color: FlowKanbanColumnColor | null;
  onPick: (color: FlowKanbanColumnColor | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        title="Column color"
        aria-label="Column color"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((o) => !o)}
        className={`size-3 rounded-full ${
          color ? COLUMN_SWATCH_DOT[color] : "border border-dashed border-gray-300 dark:border-slate-600"
        }`}
      />
      {open && (
        <div className="absolute left-0 top-5 z-20 flex w-max flex-wrap gap-1.5 rounded-lg border border-gray-200 bg-white p-2 shadow-md dark:border-slate-700 dark:bg-slate-900 dark:ring-1 dark:ring-white/10">
          <button
            type="button"
            title="Default"
            aria-label="Default (no color)"
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
            className="flex size-5 items-center justify-center rounded-full border border-dashed border-gray-300 text-[10px] text-gray-400 hover:border-gray-400 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500"
          >
            ×
          </button>
          {HOD_KANBAN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              aria-label={c}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              className={`size-5 rounded-full ${COLUMN_SWATCH_DOT[c]} ${
                color === c ? "ring-2 ring-offset-1 ring-gray-400 dark:ring-slate-500 dark:ring-offset-slate-900" : ""
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Midpoint-of-neighbors fractional order — a move only ever needs to write
 *  the ONE moved row. Falls back to a clean +1/-1 step at either end. */
function orderBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return (after as number) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/** Memoized so dragging/reordering ONE card doesn't re-render every other
 *  card on the board — relies on every prop (including callbacks) staying
 *  referentially stable across HodKanban renders, see handleAdd etc. below. */
const KanbanCardView = React.memo(function KanbanCardView({
  card,
  onRemove,
}: {
  card: FlowKanbanCard;
  onRemove: (cardId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card" },
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        willChange: isDragging ? "transform" : undefined,
      }}
      {...attributes}
      {...listeners}
      className={`group flex cursor-grab items-start gap-2 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing dark:border-slate-700 dark:bg-slate-900 ${
        isDragging ? "z-10 opacity-60" : ""
      }`}
    >
      <span aria-hidden="true" className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-gray-300 dark:text-slate-600">
        ⠿
      </span>
      <p className="min-w-0 flex-1 break-words text-sm font-medium text-gray-800 dark:text-slate-200">{card.title}</p>
      <button
        type="button"
        title="Remove card"
        aria-label="Remove card"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemove(card.id)}
        className="shrink-0 rounded-full text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100 dark:text-slate-600 dark:hover:text-red-400"
      >
        ×
      </button>
    </div>
  );
});

/** Memoized so dragging a card in ONE column (or reordering columns) doesn't
 *  re-render every other column — same stable-callback requirement as
 *  KanbanCardView; every handler below takes the id as an argument so
 *  HodKanban can pass the SAME function reference to every column instead of
 *  a fresh per-column closure each render. */
const KanbanColumnView = React.memo(function KanbanColumnView({
  columnId,
  label,
  color,
  cards,
  onAdd,
  onRemoveCard,
  onRename,
  onRecolor,
  onDeleteColumn,
}: {
  columnId: string;
  label: string;
  color: FlowKanbanColumnColor | null;
  cards: FlowKanbanCard[];
  onAdd: (columnId: string, title: string) => void;
  onRemoveCard: (cardId: string) => void;
  onRename: (columnId: string, label: string) => void;
  onRecolor: (columnId: string, color: FlowKanbanColumnColor | null) => void;
  /** May resolve { ok: false } (non-empty column); shown inline. */
  onDeleteColumn: (columnId: string) => Promise<ActionResult>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: columnId, data: { type: "column" } });
  const { setNodeRef: setDroppableRef } = useDroppable({ id: `column-${columnId}` });

  const [draft, setDraft] = React.useState("");
  const [editingLabel, setEditingLabel] = React.useState(false);
  const [labelDraft, setLabelDraft] = React.useState(label);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const cardIds = React.useMemo(() => cards.map((c) => c.id), [cards]);

  const submit = () => {
    const title = draft.trim();
    if (!title) return;
    onAdd(columnId, title);
    setDraft("");
  };

  const submitRename = () => {
    setEditingLabel(false);
    const next = labelDraft.trim();
    if (!next || next === label) {
      setLabelDraft(label);
      return;
    }
    onRename(columnId, next);
  };

  const handleDelete = async () => {
    setDeleteError(null);
    const result = await onDeleteColumn(columnId);
    if (!result.ok) setDeleteError(result.message);
  };

  return (
    <div
      ref={setSortableRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        willChange: isDragging ? "transform" : undefined,
      }}
      className={`flex min-w-0 flex-1 flex-col gap-2.5 rounded-2xl border border-gray-100 bg-gray-50 p-3.5 dark:border-slate-700 dark:bg-slate-800 ${
        isDragging ? "z-10 opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-2 border-b border-gray-200 px-1 pb-2 dark:border-slate-700">
        <button
          type="button"
          title="Drag to reorder"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
          className="flex size-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-gray-300 hover:bg-gray-200 hover:text-gray-600 active:cursor-grabbing dark:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        >
          ⠿
        </button>
        <ColumnColorPicker color={color} onPick={(c) => onRecolor(columnId, c)} />
        {editingLabel ? (
          <input
            autoFocus
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") {
                setLabelDraft(label);
                setEditingLabel(false);
              }
            }}
            onBlur={submitRename}
            className="min-w-0 flex-1 rounded border border-blue-300 bg-white px-1 py-0.5 text-sm font-semibold text-gray-700 focus:outline-none dark:border-blue-500 dark:bg-slate-950 dark:text-slate-100"
          />
        ) : (
          <h4
            title="Click to rename"
            onClick={() => setEditingLabel(true)}
            className={`cursor-text truncate text-sm font-semibold hover:text-gray-700 dark:hover:text-slate-300 ${
              color ? COLUMN_TITLE_COLOR[color] : "text-gray-500 dark:text-slate-400"
            }`}
          >
            {label}
          </h4>
        )}
        <span className="shrink-0 rounded-full bg-gray-200 px-1.5 text-xs text-gray-600 dark:bg-slate-700 dark:text-slate-300">
          {cards.length}
        </span>
        <button
          type="button"
          title="Delete column"
          aria-label="Delete column"
          onClick={handleDelete}
          className="ml-auto shrink-0 rounded-full px-1 text-gray-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400"
        >
          ×
        </button>
      </div>
      {deleteError && <p className="px-1 text-xs text-red-600 dark:text-red-400">{deleteError}</p>}
      <div ref={setDroppableRef} className="flex min-h-[60px] flex-col gap-2.5">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((c) => (
            <KanbanCardView key={c.id} card={c} onRemove={onRemoveCard} />
          ))}
        </SortableContext>
      </div>
      <div className="flex items-center gap-1.5 px-1 pt-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="+ Add a card"
          className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-400"
        />
      </div>
    </div>
  );
});

/** The "+" tile at the end of the column row — click to reveal a small
 *  "name this column" input, matching the "+ Add a card" interaction. Not
 *  itself sortable — a new column always appears at the end and is then
 *  freely draggable into position like any other. */
function AddColumnControl({ onAdd }: { onAdd: (label: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const submit = () => {
    const label = draft.trim();
    setEditing(false);
    setDraft("");
    if (label) onAdd(label);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex min-h-[60px] min-w-40 items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-gray-200 p-3 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-600 sm:self-start dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-300"
      >
        + Add column
      </button>
    );
  }
  return (
    <div className="flex min-w-40 flex-col gap-2 rounded-2xl bg-gray-50 p-3 dark:bg-slate-800">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setDraft("");
            setEditing(false);
          }
        }}
        placeholder="Column name"
        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-400"
      />
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={submit}
          className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft("");
            setEditing(false);
          }}
          className="rounded-lg px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * HOD's Details-section personal board — every column (including the
 * initial 3) is an equal, freely renamable/deletable/reorderable row. Every
 * add/move/remove/rename/reorder auto-saves immediately (no explicit Save
 * button), matching every other mutation pattern in this app.
 */
export function HodKanban({
  cards,
  columns,
  actions,
}: {
  cards: FlowKanbanCard[];
  columns: FlowKanbanColumnDef[];
  actions: HodKanbanActions;
}) {
  // Local state, optimistically updated on drag/add/remove/rename —
  // reconciled from the server-fetched props whenever they change (same
  // pattern as CeoDashboardSection's `order` state).
  const [localCards, setLocalCards] = React.useState(cards);
  React.useEffect(() => setLocalCards(cards), [cards]);
  const [localColumns, setLocalColumns] = React.useState(columns);
  React.useEffect(() => setLocalColumns(columns), [columns]);
  // Board-level failure surface for every mutation EXCEPT delete-column,
  // which already has its own per-column inline error (deleteError, above) —
  // reused as-is rather than routed through this. Every one of these is an
  // optimistic update (local state already changed before the action
  // settles); on failure this only surfaces the message, it does not roll
  // the optimistic change back.
  const [boardError, setBoardError] = React.useState<string | null>(null);

  const orderedColumns = React.useMemo(
    () => [...localColumns].sort((a, b) => a.order - b.order),
    [localColumns],
  );
  const columnIds = React.useMemo(() => orderedColumns.map((c) => c.id), [orderedColumns]);

  // Grouped/sorted ONCE per localCards change (not once per column per
  // render) — each column gets a referentially-stable array back out of the
  // map as long as localCards itself hasn't changed, so a memoized
  // KanbanColumnView can actually skip re-rendering on unrelated updates.
  const cardsByColumn = React.useMemo(() => {
    const map = new Map<string, FlowKanbanCard[]>();
    for (const c of localCards) {
      const list = map.get(c.column);
      if (list) list.push(c);
      else map.set(c.column, [c]);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [localCards]);
  const emptyCardList = React.useMemo<FlowKanbanCard[]>(() => [], []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleAdd = React.useCallback(
    (columnId: string, title: string) => {
      setBoardError(null);
      void actions.create(columnId, title).then((result) => {
        if (!result.ok) setBoardError(result.message);
      });
    },
    [actions],
  );

  const handleRemove = React.useCallback(
    (cardId: string) => {
      setLocalCards((prev) => prev.filter((c) => c.id !== cardId));
      setBoardError(null);
      void actions.remove(cardId).then((result) => {
        if (!result.ok) setBoardError(result.message);
      });
    },
    [actions],
  );

  const handleCardDragEnd = (activeCardId: string, overId: string) => {
    const activeCard = localCards.find((c) => c.id === activeCardId);
    if (!activeCard) return;

    // `over` can resolve to three different things: the column's cards-list
    // droppable ("column-<id>"), a specific card's id (insert next to it),
    // or — easy to miss — a column's OWN bare id. Every column is ALSO
    // independently sortable/droppable for the column-REORDER layer (see
    // KanbanColumnView's own useSortable), so closestCenter can resolve to
    // THAT rect instead of the inner cards-list droppable — most likely for
    // a short/empty column, or a drop that lands nearer its header than its
    // card list. Treat that the same as "dropped on the column" (previously
    // this case fell through to the card-id branch, found no matching card,
    // and silently fell back to the card's own original column — a no-op
    // that looked like the drop had failed).
    const droppedOnColumnItself = overId.startsWith("column-") || orderedColumns.some((c) => c.id === overId);
    const targetColumn = overId.startsWith("column-")
      ? overId.slice("column-".length)
      : droppedOnColumnItself
        ? overId
        : (localCards.find((c) => c.id === overId)?.column ?? activeCard.column);

    const targetList = (cardsByColumn.get(targetColumn) ?? []).filter((c) => c.id !== activeCard.id);
    const overIndex = droppedOnColumnItself ? targetList.length : Math.max(0, targetList.findIndex((c) => c.id === overId));
    const before = targetList[overIndex - 1]?.order;
    const after = targetList[overIndex]?.order;
    const newOrder = orderBetween(before, after);

    if (targetColumn === activeCard.column && newOrder === activeCard.order) return;

    setLocalCards((prev) =>
      prev.map((c) => (c.id === activeCard.id ? { ...c, column: targetColumn, order: newOrder } : c)),
    );
    setBoardError(null);
    void actions.move(activeCard.id, targetColumn, newOrder).then((result) => {
      if (!result.ok) setBoardError(result.message);
    });
  };

  const handleColumnDragEnd = (activeColumnId: string, overId: string) => {
    const activeColumn = orderedColumns.find((c) => c.id === activeColumnId);
    if (!activeColumn) return;

    // `over` may resolve to another column's own id, OR (if dragged over a
    // card inside it) that card's parent column — either way, land next to
    // that column.
    const targetColumnId = orderedColumns.some((c) => c.id === overId)
      ? overId
      : (localCards.find((c) => c.id === overId)?.column ?? activeColumn.id);
    if (targetColumnId === activeColumn.id) return;

    const others = orderedColumns.filter((c) => c.id !== activeColumn.id);
    const overIndex = Math.max(0, others.findIndex((c) => c.id === targetColumnId));
    const before = others[overIndex - 1]?.order;
    const after = others[overIndex]?.order;
    const newOrder = orderBetween(before, after);
    if (newOrder === activeColumn.order) return;

    setLocalColumns((prev) =>
      prev.map((c) => (c.id === activeColumnId ? { ...c, order: newOrder } : c)),
    );
    setBoardError(null);
    void actions.moveColumn(activeColumnId, newOrder).then((result) => {
      if (!result.ok) setBoardError(result.message);
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    if (active.data.current?.type === "column") {
      handleColumnDragEnd(String(active.id), overId);
    } else {
      handleCardDragEnd(String(active.id), overId);
    }
  };

  const handleAddColumn = (label: string) => {
    setBoardError(null);
    void actions.createColumn(label).then((result) => {
      if (!result.ok) setBoardError(result.message);
    });
  };

  const handleRenameColumn = React.useCallback(
    (columnId: string, label: string) => {
      setLocalColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, label } : c)));
      setBoardError(null);
      void actions.renameColumn(columnId, label).then((result) => {
        if (!result.ok) setBoardError(result.message);
      });
    },
    [actions],
  );

  // Unlike the other handlers here, this one's result is returned (not just
  // surfaced to boardError) — KanbanColumnView's own handleDelete shows it
  // inline next to that one column, the existing pattern this whole file's
  // error handling was modeled on.
  const handleDeleteColumn = React.useCallback(
    async (columnId: string): Promise<ActionResult> => {
      const result = await actions.deleteColumn(columnId);
      if (result.ok) {
        setLocalColumns((prev) => prev.filter((c) => c.id !== columnId));
      }
      return result;
    },
    [actions],
  );

  const handleRecolorColumn = React.useCallback(
    (columnId: string, color: FlowKanbanColumnColor | null) => {
      setLocalColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, color } : c)));
      setBoardError(null);
      void actions.recolorColumn(columnId, color).then((result) => {
        if (!result.ok) setBoardError(result.message);
      });
    },
    [actions],
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400">
          My Board
        </h3>
        {boardError && (
          <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
            {boardError}
            <button
              type="button"
              onClick={() => setBoardError(null)}
              aria-label="Dismiss"
              className="text-red-400 hover:text-red-600 dark:text-red-300 dark:hover:text-red-200"
            >
              ×
            </button>
          </p>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
            {orderedColumns.map((column) => (
              <KanbanColumnView
                key={column.id}
                columnId={column.id}
                label={column.label}
                color={column.color}
                cards={cardsByColumn.get(column.id) ?? emptyCardList}
                onAdd={handleAdd}
                onRemoveCard={handleRemove}
                onRename={handleRenameColumn}
                onRecolor={handleRecolorColumn}
                onDeleteColumn={handleDeleteColumn}
              />
            ))}
          </SortableContext>
          <AddColumnControl onAdd={handleAddColumn} />
        </div>
      </DndContext>
    </div>
  );
}
