// Fallback cards for the Task Manager pages — modeled on the osc-demo
// BridgeErrorCard. Pure presentational: the server pages decide which one to
// render (SetupPendingError → SetupPendingCard, NoAccountError →
// NoAccountCard, anything else → TaskManagerErrorCard).

export function SetupPendingCard() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-200">
      <p className="font-medium">Task Manager is being set up</p>
      <p className="mt-1">
        This environment isn&apos;t connected to the Task Manager database yet.
        Check back soon — no action needed on your side.
      </p>
    </div>
  );
}

export function NoAccountCard({ email }: { email: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      <p className="font-medium text-gray-800 dark:text-slate-200">No Task Manager account yet</p>
      <p className="mt-1">
        There&apos;s no Task Manager account for <span className="font-medium">{email}</span>.
        Ask your admin to add you to the staff roster.
      </p>
    </div>
  );
}

export function TaskManagerErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-700 dark:bg-red-900 dark:text-red-200">
      <p className="font-medium">Task Manager error</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}
