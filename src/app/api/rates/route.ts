import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const userIdStr = searchParams.get("userId");

  try {
    if (userIdStr) {
      const userId = parseInt(userIdStr, 10);
      const history = await prisma.employee_rate_history.findMany({
        where: { user_id: userId },
        orderBy: { effective_from: "desc" }
      });
      return NextResponse.json({ success: true, history });
    } else {
      // Return currently active rates for all users
      const currentRates = await prisma.employee_rate_history.findMany({
        where: { effective_to: null },
      });
      return NextResponse.json({ success: true, currentRates });
    }
  } catch (err) {
    console.error("[GET /api/rates]", err);
    return NextResponse.json({ success: false, error: "Failed to fetch rates" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  try {
    const raw = await req.json();
    const userId = parseInt(raw.userId, 10);
    const rate = parseFloat(raw.rate);
    const effectiveFromStr = raw.effectiveFrom as string;

    if (isNaN(userId) || isNaN(rate) || !effectiveFromStr) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const effectiveFrom = new Date(`${effectiveFromStr}T00:00:00Z`);

    // Verify user exists
    const user = await prisma.users.findUnique({ where: { user_id: userId } });
    if (!user) {
      return NextResponse.json({ success: false, error: "Unknown user" }, { status: 400 });
    }

    // Run transaction to close old rate and create new one
    await prisma.$transaction(async (tx) => {
      // Find currently active rate
      const activeRate = await tx.employee_rate_history.findFirst({
        where: { user_id: userId, effective_to: null },
      });

      if (activeRate) {
        // If the new rate is for the exact same start date or earlier, reject it to keep history sane
        if (effectiveFrom.getTime() <= activeRate.effective_from.getTime()) {
          throw new Error("New rate effective date must be strictly after the current active rate's effective date.");
        }

        // Set effective_to to the day before the new effective_from
        const effectiveTo = new Date(effectiveFrom);
        effectiveTo.setUTCDate(effectiveTo.getUTCDate() - 1);

        await tx.employee_rate_history.update({
          where: { rate_history_id: activeRate.rate_history_id },
          data: { effective_to: effectiveTo }
        });
      }

      // Insert new rate
      await tx.employee_rate_history.create({
        data: {
          user_id: userId,
          rate: rate,
          effective_from: effectiveFrom,
          effective_to: null
        }
      });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[POST /api/rates]", err);
    return NextResponse.json({ success: false, error: err?.message || "Failed to add rate" }, { status: 500 });
  }
}
