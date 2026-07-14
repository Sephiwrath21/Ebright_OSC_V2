"use client";

import { useEffect, useState } from "react";
import { Plus, Check, X, ListTodo } from "lucide-react";

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

export default function ToDoList({
  storageKey = "dashboard-todos",
}: {
  storageKey?: string;
}) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Load once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setTodos(JSON.parse(raw) as Todo[]);
    } catch {
      // ignore malformed storage
    }
    setLoaded(true);
  }, [storageKey]);

  // Persist after load so we don't clobber existing items with the initial [].
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(todos));
    } catch {
      // ignore quota / privacy-mode errors
    }
  }, [todos, loaded, storageKey]);

  const add = () => {
    const t = text.trim();
    if (!t) return;
    setTodos((prev) => [
      { id: `${Date.now()}-${prev.length}`, text: t, done: false },
      ...prev,
    ]);
    setText("");
  };

  const toggle = (id: string) =>
    setTodos((prev) =>
      prev.map((td) => (td.id === id ? { ...td, done: !td.done } : td)),
    );

  const remove = (id: string) =>
    setTodos((prev) => prev.filter((td) => td.id !== id));

  const remaining = todos.filter((t) => !t.done).length;

  return (
    <section className="bg-white border border-slate-200 rounded-2xl px-6 py-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-slate-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-900">To-Do List</h2>
        </div>
        {todos.length > 0 && (
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
            {remaining} left
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Add a task…"
          className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={add}
          disabled={!text.trim()}
          aria-label="Add task"
          className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
        >
          <Plus className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {todos.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">
          Nothing here yet — add your first task.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto -mx-1 px-1">
          {todos.map((td) => (
            <li
              key={td.id}
              className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 transition-colors"
            >
              <button
                type="button"
                onClick={() => toggle(td.id)}
                aria-pressed={td.done}
                aria-label={td.done ? "Mark as not done" : "Mark as done"}
                className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                  td.done
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-slate-300 text-transparent hover:border-emerald-400"
                }`}
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <span
                className={`flex-1 min-w-0 text-sm break-words ${
                  td.done ? "text-slate-400 line-through" : "text-slate-700"
                }`}
              >
                {td.text}
              </span>
              <button
                type="button"
                onClick={() => remove(td.id)}
                aria-label="Remove task"
                className="shrink-0 w-7 h-7 rounded-lg grid place-items-center text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600 transition-all"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
