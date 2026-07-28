import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { EMPLOYEE_RECORD_CATEGORIES } from "@/lib/employeeRecordConfig";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EmployeeRecordPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { id } = await params;
  const defaultCategory = EMPLOYEE_RECORD_CATEGORIES[0];
  redirect(`/employee-record/${id}/${defaultCategory.key}/${defaultCategory.sections[0].key}`);
}
