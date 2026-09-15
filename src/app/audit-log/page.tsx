import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { buildAccess } from "@/lib/access/engine";
import AppShell from "@/app/components/AppShell";
import AuditLogView from "./AuditLogView";
import { AUDIT_ACTIONS, entityLabel } from "@/lib/audit/describe";
import { PRIMARY_KEYS } from "@/lib/audit/primary-keys";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Log · Ebright HR System",
};

export default async function AuditLogPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const access = await buildAccess(session.user.email);
  if (!access) redirect("/login");

  // The sidebar already hides this entry, but that is a UX filter only — the
  // real gate is here, the same rule /api/audit-log enforces on every request.
  if (!access.can("audit_log", "view")) redirect("/home");

  // The record-type filter is built from the schema's own model list rather
  // than from a SELECT DISTINCT over audit_log: it costs nothing, it is
  // complete from the first day (before a table has ever been written to),
  // and it stays correct as the schema grows.
  const entityOptions = Object.keys(PRIMARY_KEYS)
    .map((model) => ({ value: model, label: entityLabel(model) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <AppShell
      email={session.user.email}
      role={(session.user as { role?: string } | undefined)?.role ?? ""}
      name={session.user?.name ?? null}
    >
      <AuditLogView
        actionOptions={AUDIT_ACTIONS}
        entityOptions={entityOptions}
        canExport={access.can("audit_log", "export")}
      />
    </AppShell>
  );
}
