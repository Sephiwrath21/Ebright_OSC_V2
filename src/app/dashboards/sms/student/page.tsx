import { auth } from "@/auth";
import { redirect } from "next/navigation";
import StudentListClient from "@/app/components/StudentListClient";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Student | SMS",
};

export default async function StudentPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <StudentListClient />
    </AppShell>
  );
}
