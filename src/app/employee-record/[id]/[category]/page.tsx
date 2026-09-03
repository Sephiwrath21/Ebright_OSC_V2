import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { findRecordCategory } from "@/lib/employeeRecordConfig";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string; category: string }>;
}

export default async function EmployeeRecordCategoryPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { id, category } = await params;
  const cat = findRecordCategory(category);
  if (!cat) notFound();

  redirect(`/employee-record/${id}/${cat.key}/${cat.sections[0].key}`);
}
