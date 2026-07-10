import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSpaceTasks } from "@/lib/clickup";

export const dynamic = "force-dynamic";

const OPTIMISATION_SPACE_ID = "90164365728";

// Database init & seed helper
async function ensureTicketsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.od_tickets (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) UNIQUE NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 10
    );
  `);

  const countRes = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) FROM public.od_tickets;`
  );
  const dbCount = Number(countRes[0]?.count ?? 0);

  if (dbCount === 0) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO public.od_tickets (name, count, total) VALUES
        ('Aone', 3, 5),
        ('PS', 4, 8),
        ('Leads', 2, 6),
        ('Clickup', 5, 10),
        ('Others', 1, 4)
      ON CONFLICT (name) DO NOTHING;
    `);
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authorize only od@ebright.my or superadmin
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { email: true, role: { select: { role_type: true } } },
  });

  const isSuper = me?.role?.role_type === "superadmin";
  const isOD = me?.email?.toLowerCase() === "od@ebright.my";

  if (!me || (!isSuper && !isOD)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Ensure tickets table exists and get ticket counts from DB
    await ensureTicketsTable();
    const tickets = await prisma.$queryRawUnsafe<{ name: string; count: number; total: number }[]>(
      `SELECT name, count, total FROM public.od_tickets ORDER BY id ASC;`
    );

    // 2. Query attendance metrics from DB
    const [onboarding, offboarding, mcCount, alCount] = await Promise.all([
      prisma.induction_profile.count({
        where: {
          induction_type: "Onboarding",
          status: { in: ["Sent", "In Progress", "Created"] },
        },
      }),
      prisma.induction_profile.count({
        where: {
          induction_type: "Offboarding",
          status: { in: ["Sent", "In Progress", "Created"] },
        },
      }),
      prisma.leave_request.count({
        where: {
          status: "approved",
          start_date: { lte: today },
          end_date: { gte: today },
          leave_types: {
            leave_type_code: "MC",
          },
        },
      }),
      prisma.leave_request.count({
        where: {
          status: "approved",
          start_date: { lte: today },
          end_date: { gte: today },
          leave_types: {
            leave_type_code: "AL",
          },
        },
      }),
    ]);

    // 3. Fetch ClickUp tasks from ClickUp API
    let clickupTasks: any[] = [];
    let clickupConfigured = false;
    const dailyDistribution = {
      PENDING: 0,
      COMPLETE: 0,
      "NOT APPLICABLE": 0,
      "N/A": 0,
    };

    const token = process.env.CLICKUP_API_TOKEN;
    const teamId = process.env.CLICKUP_TEAM_ID;

    if (token && teamId) {
      try {
        const rawTasks = await getSpaceTasks(teamId, OPTIMISATION_SPACE_ID, token, {
          includeClosed: true,
          subtasks: true,
        });

        // Filter: tasks that are open OR completed/closed in the last 7 days
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        clickupTasks = rawTasks
          .filter((t) => {
            const isOpen = t.status.toLowerCase() !== "complete" && t.status.toLowerCase() !== "closed";
            const closedRecently = t.doneDate && t.doneDate >= sevenDaysAgo;
            return isOpen || closedRecently;
          })
          .map((t) => ({
            id: t.id,
            name: t.name,
            status: t.status,
            listName: t.listName,
            url: t.url,
            completed: t.status.toLowerCase() === "complete" || t.status.toLowerCase() === "closed",
          }));

        // Status aggregation for the Tue-Sat folders
        const DAILY_FOLDERS = new Set([
          "tuesday", "wednesday", "thursday", "friday", "saturday",
          "tuesday (x)", "wednesday (x)", "thursday(x)", "friday(x)", "saturday(x)"
        ]);

        const dailyTasks = rawTasks
          .filter((t) => t.folderName && DAILY_FOLDERS.has(t.folderName.trim().toLowerCase()))
          .map((t) => {
            let s = t.status.toUpperCase();
            if (s === "CLOSED") s = "COMPLETE";
            if (s === "NA") s = "N/A";
            if (s === "NOT_APPLICABLE") s = "NOT APPLICABLE";
            return {
              id: t.id,
              name: t.name,
              status: s,
              listName: t.listName,
              url: t.url,
            };
          });

        for (const t of dailyTasks) {
          const s = t.status;
          if (s === "COMPLETE") {
            dailyDistribution.COMPLETE += 1;
          } else if (s === "NOT APPLICABLE") {
            dailyDistribution["NOT APPLICABLE"] += 1;
          } else if (s === "N/A") {
            dailyDistribution["N/A"] += 1;
          } else {
            dailyDistribution.PENDING += 1;
          }
        }

        clickupConfigured = true;
      } catch (err) {
        console.error("Failed to fetch ClickUp tasks in OD API:", err);
      }
    }

    return NextResponse.json({
      success: true,
      attendance: {
        onboarding,
        offboarding,
        mc: mcCount,
        al: alCount,
      },
      tickets,
      clickup: {
        configured: clickupConfigured,
        tasks: clickupTasks,
        dailyDistribution,
        dailyTasks,
      },
    });
  } catch (error) {
    console.error("Failed to load OD dashboard data:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authorize only od@ebright.my or superadmin
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { email: true, role: { select: { role_type: true } } },
  });

  const isSuper = me?.role?.role_type === "superadmin";
  const isOD = me?.email?.toLowerCase() === "od@ebright.my";

  if (!me || (!isSuper && !isOD)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { type } = body;

    // A. Update ticket counter in DB
    if (type === "update_ticket") {
      const { name, count, total } = body;
      await ensureTicketsTable();

      await prisma.$executeRawUnsafe(
        `UPDATE public.od_tickets SET count = $1, total = $2 WHERE name = $3;`,
        Number(count),
        Number(total),
        name
      );

      return NextResponse.json({ success: true });
    }

    // B. Update ClickUp task status in ClickUp API
    if (type === "update_clickup_task") {
      const { taskId, completed } = body;
      const token = process.env.CLICKUP_API_TOKEN;
      if (!token) {
        return NextResponse.json({ error: "ClickUp is not configured" }, { status: 400 });
      }

      const nextStatus = completed ? "complete" : "pending";

      const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
        method: "PUT",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`ClickUp API returned status ${res.status}: ${errorText}`);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid request type" }, { status: 400 });
  } catch (error) {
    console.error("POST OD dashboard error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
