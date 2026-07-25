import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { listConversation, sendMessage } from "@/lib/department-chat";
import { isDeptMember, isAdminEmail } from "@/lib/department-members";
import { canSeeAllDepartments } from "@/lib/departments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionUser = { email?: string | null; name?: string | null; role?: string | null };

async function gate(slug: string): Promise<{ email: string; name: string | null } | null> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.email) return null;
  const allowed = canSeeAllDepartments(user.role) || (await isDeptMember(user.email, slug));
  return allowed ? { email: user.email, name: user.name ?? null } : null;
}

// GET ?with=<email>  → private conversation; omitted/"all" → Everyone
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const me = await gate(slug);
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const withParam = req.nextUrl.searchParams.get("with");
  const withEmail = !withParam || withParam === "all" ? null : withParam;
  try {
    const messages = await listConversation(slug, me.email, withEmail);
    return NextResponse.json({ messages });
  } catch (e) {
    console.error("[chat] list failed", slug, e instanceof Error ? e.message : e);
    return NextResponse.json({ messages: [] });
  }
}

// POST { to: email|null, body }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const me = await gate(slug);
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { to, body } = (await req.json().catch(() => ({}))) as { to?: string | null; body?: string };
  const text = (body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Empty message" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "Too long" }, { status: 400 });

  // A private recipient must be in this department, or be an admin (admins can
  // chat with anyone). Everyone-messages (to=null) skip this.
  const recipientEmail = to && to !== "all" ? to : null;
  if (
    recipientEmail &&
    !(await isDeptMember(recipientEmail, slug)) &&
    !(await isAdminEmail(recipientEmail))
  ) {
    return NextResponse.json({ error: "Recipient not in department" }, { status: 400 });
  }

  try {
    const message = await sendMessage({
      dept: slug,
      senderEmail: me.email,
      senderName: me.name,
      recipientEmail,
      body: text,
    });
    return NextResponse.json({ message });
  } catch (e) {
    console.error("[chat] send failed", slug, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}
