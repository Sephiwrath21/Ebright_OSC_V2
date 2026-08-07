'use client'

/**
 * Shown when a department that has no CRM (Nexus) build of its own lands in the
 * lead module — Operation, Human Resource, Finance, Academy, CEO.
 *
 * Better than an empty dashboard: an empty board reads as "your leads are
 * missing", which is exactly the confusion that sent people looking for data
 * that was never there. This says plainly that the build doesn't exist yet and
 * offers the two places they can actually go.
 */

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Ticket, Home, LayoutDashboard } from 'lucide-react'
import { DEPARTMENTS } from '@/lib/crm/departments'

export function NoNexusPageClient() {
  const params = useSearchParams()
  const subType = params.get('dept')
  const dept = DEPARTMENTS.find((d) => d.subType === subType) ?? null

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
          <LayoutDashboard className="h-7 w-7" />
        </div>

        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
          {dept ? `${dept.name} doesn't have its own Nexus yet` : "You don't have your own Nexus"}
        </h1>

        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          You don&apos;t have your own Nexus — contact the{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">Optimisation Department</span>{' '}
          to have your own build.
        </p>

        <p className="mx-auto mt-3 max-w-sm text-xs text-slate-400 dark:text-slate-500">
          Your tickets still work as normal — only the lead CRM is unavailable for this department.
        </p>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href={subType ? `/crm/tickets/kanban?dept=${subType}` : '/crm/tickets'}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            <Ticket className="h-4 w-4" />
            Go to ticket system
          </Link>
          <Link
            href="/dashboards/crm"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Home className="h-4 w-4" />
            Homepage
          </Link>
        </div>
      </div>
    </div>
  )
}
