'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { TicketForm } from '@/components/crm/tickets/TicketForm'

export default function NewTicketPage() {
  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/crm/tickets"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Tickets
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">New Ticket</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Submit a new support ticket
        </p>
      </div>
      <TicketForm />
    </div>
  )
}
