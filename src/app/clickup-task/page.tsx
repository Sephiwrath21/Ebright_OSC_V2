import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { resolveAllowedDepartments } from "@/lib/department-access";

export const dynamic = "force-dynamic";

const fontStack =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export default async function ClickUpTaskPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userEmail = session.user?.email ?? "";
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const userName = session.user?.name ?? null;

  const departments = await resolveAllowedDepartments(userEmail, userRole);

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <div
        style={{
          minHeight: "100%",
          background: "var(--status-neutral-bg)",
          fontFamily: fontStack,
          color: "var(--text-primary)",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
          <header style={{ marginBottom: 20 }}>
            <Link
              href="/home"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                border: "0.5px solid var(--status-track)",
                borderRadius: 8,
                background: "var(--surface)",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                marginBottom: 16,
              }}
            >
              <i className="ti ti-arrow-left" />
              Back
            </Link>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>ClickUp Task</h1>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--text-muted-strong)" }}>
              Choose a department to open its dashboard.
            </p>
          </header>

          {departments.length === 0 ? (
            <div
              style={{
                background: "var(--surface)",
                border: "0.5px solid var(--status-track)",
                borderRadius: 12,
                padding: 24,
                fontSize: 14,
                color: "var(--text-muted-strong)",
              }}
            >
              You don&apos;t have a department assigned, so there&apos;s nothing to show here.
              Contact an admin if this looks wrong.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 14,
              }}
            >
              {departments.map((d) => (
                <Link
                  key={d.slug}
                  href={`/clickup-task/${d.slug}`}
                  style={{ textDecoration: "none" }}
                >
                  <div
                    style={{
                      background: "var(--surface)",
                      border: "0.5px solid var(--status-track)",
                      borderRadius: 12,
                      padding: 18,
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      transition: "box-shadow 0.2s, transform 0.2s",
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        flexShrink: 0,
                        background: d.color,
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 24,
                      }}
                    >
                      {d.icon}
                    </div>
                    <div style={{ minWidth: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                      {d.name}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
