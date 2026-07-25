import { prisma } from "@/lib/prisma";

export async function calculateManpowerCost(branchId: number, startDateStr: string, endDateStr: string) {
  const startDate = new Date(`${startDateStr}T00:00:00Z`);
  const endDate = new Date(`${endDateStr}T00:00:00Z`);

  // 1. Fetch all actual schedules for the branch in this period
  const schedules = await prisma.manpower_schedule.findMany({
    where: {
      schedule_type: "actual",
      date: { gte: startDate, lte: endDate },
      branch_duty_position: { branch_id: branchId }
    },
    include: {
      slot: true,
      branch_duty_position: true,
      user_profile: true
    }
  });

  // Group by date and user_id
  const dailyCosts: Record<string, {
    date: Date;
    user_id: number;
    coach_hrs: number;
    exec_hrs: number;
    training_hrs: number;
    star_coach_hrs: number;
  }> = {};

  for (const s of schedules) {
    if (!s.user_profile?.user_id) continue;
    const userId = s.user_profile.user_id;
    const dateStr = s.date.toISOString().split("T")[0];
    const key = `${dateStr}_${userId}`;

    if (!dailyCosts[key]) {
      dailyCosts[key] = {
        date: s.date,
        user_id: userId,
        coach_hrs: 0,
        exec_hrs: 0,
        training_hrs: 0,
        star_coach_hrs: 0,
      };
    }

    // Calculate hours duration
    let hours = 0;
    if (s.slot.slot_start && s.slot.slot_end) {
      // Slot times are returned as Date objects, typically 1970-01-01 + time
      const diffMs = s.slot.slot_end.getTime() - s.slot.slot_start.getTime();
      hours = diffMs / (1000 * 60 * 60);
    }
    
    // Safety check in case times are not perfectly parsed
    if (hours < 0) hours = 0;

    const posType = s.branch_duty_position.position_type;
    const posLabel = s.branch_duty_position.position_label.toLowerCase();

    // Map the position to the correct category
    // Note: The schema only allows position_type in ('manager','coach','exec','training','star_coach')
    if (posType === "coach" || posLabel.startsWith("coach")) {
      // Check if it's actually training or star coach by label if type is just "coach"
      if (posLabel.startsWith("training")) dailyCosts[key].training_hrs += hours;
      else if (posLabel.startsWith("star coach")) dailyCosts[key].star_coach_hrs += hours;
      else dailyCosts[key].coach_hrs += hours;
    } else if (posType === "exec" || posLabel.startsWith("exec")) {
      dailyCosts[key].exec_hrs += hours;
    } else if (posType === "training") {
      dailyCosts[key].training_hrs += hours;
    } else if (posType === "star_coach") {
      dailyCosts[key].star_coach_hrs += hours;
    } else {
      // E.g., manager — typically salaried, but if they get coach/exec hours they might have specific logic.
      // Assuming manager on duty hours are counted as coach hours based on previous setups.
      dailyCosts[key].coach_hrs += hours;
    }
  }

  // 2. Fetch employee rate histories for all relevant users
  const userIds = Array.from(new Set(Object.values(dailyCosts).map(d => d.user_id)));
  const rateHistories = await prisma.employee_rate_history.findMany({
    where: { user_id: { in: userIds } }
  });

  const results = [];

  // 3. Process each daily cost record and apply rates
  for (const record of Object.values(dailyCosts)) {
    // Online branch (branch_id = 21) coaches are only paid coach_hrs, not exec_hrs —
    // except Poojha (user_id = 264), who is paid like a normal branch coach, but only
    // on Saturdays; her other days follow the same online-branch restriction.
    if (branchId === 21) {
      const isSaturday = record.date.getUTCDay() === 6;
      const isPoojhaOnSaturday = record.user_id === 264 && isSaturday;
      if (!isPoojhaOnSaturday) {
        record.exec_hrs = 0;
      }
    }

    // Find applicable coach rate for this date
    const applicableRate = rateHistories.find(r => {
      if (r.user_id !== record.user_id) return false;
      const effectiveFrom = r.effective_from.getTime();
      const dateTime = record.date.getTime();
      if (effectiveFrom > dateTime) return false;
      if (r.effective_to) {
        const effectiveTo = r.effective_to.getTime();
        if (effectiveTo < dateTime) return false;
      }
      return true;
    });

    const coachRate = applicableRate ? Number(applicableRate.rate) : 0;
    const execRate = 11;
    const trainingRate = 8;
    const starCoachRate = 50;

    const totalPay = 
      (record.coach_hrs * coachRate) + 
      (record.exec_hrs * execRate) + 
      (record.training_hrs * trainingRate) + 
      (record.star_coach_hrs * starCoachRate);

    results.push({
      user_id: record.user_id,
      date: record.date,
      coach_hrs: record.coach_hrs,
      exec_hrs: record.exec_hrs,
      training_hrs: record.training_hrs,
      star_coach_hrs: record.star_coach_hrs,
      coach_rate: coachRate,
      exec_rate: execRate,
      training_rate: trainingRate,
      star_coach_rate: starCoachRate,
      total_pay: totalPay
    });
  }

  return results;
}
