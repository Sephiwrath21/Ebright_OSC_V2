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
  NoAccountError,
  renameTaskCategory,
  SetupPendingError,
  unarchiveTaskCategory,
  type TaskCategorySummary,
} from "@/task-manager/data";
import { CategoryManager } from "@/task-manager/ui/category-manager";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";

export const dynamic = "force-dynamic";

const FALLBACK_MESSAGE = "Something went wrong — please try again";

export default async function TaskCategoriesPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  // Same three-way SetupPendingError -> SetupPendingCard, NoAccountError ->
  // NoAccountCard, any other error -> TaskManagerErrorCard mapping as
  // template/package/package-table's page.tsx. Unlike those pages, the
  // access gate here is a single explicit redirect (no View/Edit two-tier
  // split for Categories, see this page's own plan doc) rather than a
  // caught 403, so it has to run BETWEEN the two fetches and outside any
  // try/catch — catching next/navigation's redirect() would swallow it
  // instead of letting it propagate. Two small try/catches (one per fetch)
  // share this card-building helper rather than duplicating the mapping.
  const errorPage = (err: unknown) => {
    let card;
    if (err instanceof SetupPendingError) {
      card = <SetupPendingCard />;
    } else if (err instanceof NoAccountError) {
      card = <NoAccountCard email={email} />;
    } else {
      card = (
        <TaskManagerErrorCard message={err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE} />
      );
    }
    return (
      <AppShell email={su.email} role={su.role} name={su.name}>
        <div className="mx-auto max-w-[1400px] p-6">{card}</div>
      </AppShell>
    );
  };

  let role: { role: string; department: string | null };
  try {
    role = await getMyRole(email);
  } catch (err) {
    return errorPage(err);
  }
  if (!canManageTaskTemplateGroups(role)) redirect("/task-manager");

  let categories: TaskCategorySummary[];
  try {
    categories = await listTaskCategories(email);
  } catch (err) {
    return errorPage(err);
  }

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
