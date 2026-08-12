import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireLiveSession } from "@/task-manager/action-session";
import AppShell from "@/app/components/AppShell";
import { canManageTaskTemplateGroups } from "@/task-manager/role-views";
import {
  archiveTaskCategory,
  createTaskCategory,
  FlowBridgeError,
  getMyRole,
  listTaskCategories,
  renameTaskCategory,
  unarchiveTaskCategory,
} from "@/task-manager/data";
import { CategoryManager } from "@/task-manager/ui/category-manager";

export const dynamic = "force-dynamic";

const FALLBACK_MESSAGE = "Something went wrong — please try again";

export default async function TaskCategoriesPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  const role = await getMyRole(email);
  if (!canManageTaskTemplateGroups(role)) redirect("/task-manager");

  const categories = await listTaskCategories(email);

  async function create(name: string) {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await createTaskCategory(email, { name });
      revalidatePath("/task-manager/categories");
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function rename(id: string, name: string) {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await renameTaskCategory(email, id, { name });
      revalidatePath("/task-manager/categories");
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function archive(id: string) {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await archiveTaskCategory(email, id);
      revalidatePath("/task-manager/categories");
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function unarchive(id: string) {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await unarchiveTaskCategory(email, id);
      revalidatePath("/task-manager/categories");
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  return (
    <AppShell email={su.email} role={su.role} name={su.name}>
      <CategoryManager
        initialCategories={categories}
        onCreate={create}
        onRename={rename}
        onArchive={archive}
        onUnarchive={unarchive}
      />
    </AppShell>
  );
}
