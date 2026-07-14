"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CalendarDays, MapPin, Users, Info,
} from "lucide-react";
import { useBreadcrumb } from "@/app/components/BreadcrumbContext";
import { addDays, format } from "date-fns";

interface FormState {
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  numberOfDays: 1 | 2 | 3;
  invitationOpenDate: string;
  invitationCloseDate: string;
  notes: string;
}

function formatDisplay(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

export default function NewEventClient() {
  useBreadcrumb([
    { label: "Home", href: "/home" },
    { label: "FA System", href: "/dashboards/fa" },
    { label: "Events", href: "/dashboards/fa/events" },
    { label: "New Event" },
  ]);

  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState<FormState>({
    name: "",
    venue: "",
    startDate: "",
    endDate: "",
    numberOfDays: 2,
    invitationOpenDate: "",
    invitationCloseDate: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleStartDateChange(v: string) {
    const d = new Date(v + "T00:00:00");
    const autoName = `${format(d, "d-")}${format(addDays(d, form.numberOfDays - 1), "d MMMM")} Weekly Showcase`;
    setForm(f => ({
      ...f,
      startDate: v,
      name: f.name || autoName,
      endDate: f.numberOfDays === 1
        ? v
        : format(addDays(d, f.numberOfDays - 1), "yyyy-MM-dd"),
    }));
  }

  function handleDaysChange(n: 1 | 2 | 3) {
    setForm(f => ({
      ...f,
      numberOfDays: n,
      endDate: f.startDate
        ? (n === 1 ? f.startDate : format(addDays(new Date(f.startDate + "T00:00:00"), n - 1), "yyyy-MM-dd"))
        : f.endDate,
    }));
  }

  function validate(): string | null {
    if (!form.name.trim())          return "Event name is required.";
    if (!form.venue.trim())         return "Venue is required.";
    if (!form.startDate)            return "Start date is required.";
    if (!form.endDate)              return "End date is required.";
    if (!form.invitationOpenDate)   return "Invitation open date is required.";
    if (!form.invitationCloseDate)  return "Invitation close date is required.";
    if (new Date(form.endDate) < new Date(form.startDate))
      return "End date must be on or after start date.";
    if (new Date(form.invitationCloseDate) < new Date(form.invitationOpenDate))
      return "Invitation close date must be after open date.";
    if (new Date(form.invitationCloseDate) > new Date(form.startDate))
      return "Invitations must close before the event starts.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setSubmitting(true);
    // Dummy: navigate back to events list
    router.push("/dashboards/fa/events");
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 pt-4 pb-12">

        {/* Back */}
        <Link
          href="/dashboards/fa/events"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to events
        </Link>

        {/* Page header */}
        <div className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">New event</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
            Create FA Event
          </h1>
          <hr className="border-slate-200 mt-5 mb-4" />
          <p className="text-sm text-slate-500">
            Fill in the event details. You&apos;ll add sessions and branch quotas on the next screen.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-6">

          {/* Left: form */}
          <div className="lg:col-span-2 space-y-5">

            {/* Event details section */}
            <section className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="mb-5 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <h2 className="text-lg font-semibold text-slate-900">Event details</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Event name</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent placeholder:text-slate-400 transition"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. 27-28 June Weekly Showcase"
                  />
                  <p className="text-xs text-slate-400 mt-1">Auto-generated from start date, but you can edit it.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Venue</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent placeholder:text-slate-400 transition"
                      value={form.venue}
                      onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                      placeholder="e.g. Atria Mall, Pavilion KL"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Start date</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
                      value={form.startDate}
                      min={today}
                      onChange={e => handleStartDateChange(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">End date</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
                      value={form.endDate}
                      min={form.startDate || today}
                      onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Number of days</label>
                  <div className="flex gap-2">
                    {([1, 2, 3] as const).map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleDaysChange(n)}
                        className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                          form.numberOfDays === n
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                        }`}
                      >
                        {n} day{n > 1 ? "s" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Invitation window section */}
            <section className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                <h2 className="text-lg font-semibold text-slate-900">Invitation window</h2>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                The period when Branch Managers can invite students to this event. Must close before the event starts.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Open date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
                    value={form.invitationOpenDate}
                    onChange={e => setForm(f => ({ ...f, invitationOpenDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Close date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
                    value={form.invitationCloseDate}
                    min={form.invitationOpenDate}
                    max={form.startDate}
                    onChange={e => setForm(f => ({ ...f, invitationCloseDate: e.target.value }))}
                  />
                </div>
              </div>
            </section>

            {/* Notes section */}
            <section className="bg-white border border-slate-200 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Notes</h2>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Internal notes <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent placeholder:text-slate-400 transition min-h-[80px] resize-y"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Internal notes about this event…"
              />
            </section>

            {error && (
              <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm border border-red-200">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Link
                href="/dashboards/fa/events"
                className="px-4 py-2.5 text-sm font-medium border border-slate-200 bg-white rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 text-sm font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-60"
              >
                {submitting ? "Creating…" : "Create event"}
              </button>
            </div>
          </div>

          {/* Right: preview */}
          <div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sticky top-4">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-900">Preview</h3>
              </div>
              <dl className="space-y-4">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Name</dt>
                  <dd className="text-sm font-medium text-slate-900">{form.name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">When</dt>
                  <dd className="text-sm font-mono text-slate-800">
                    {form.startDate && form.endDate
                      ? `${formatDisplay(form.startDate)} → ${formatDisplay(form.endDate)} (${form.numberOfDays} day${form.numberOfDays > 1 ? "s" : ""})`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Venue</dt>
                  <dd className="text-sm text-slate-800">{form.venue || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Invitation window</dt>
                  <dd className="text-sm font-mono text-slate-800">
                    {form.invitationOpenDate && form.invitationCloseDate
                      ? `${formatDisplay(form.invitationOpenDate)} → ${formatDisplay(form.invitationCloseDate)}`
                      : "—"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-400">
                After creating, you&apos;ll add <strong className="text-slate-600">sessions</strong> and
                assign <strong className="text-slate-600">branch quotas</strong> before opening the event.
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
