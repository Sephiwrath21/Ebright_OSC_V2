import {
  nextMonday,
  isMonday,
  addDays,
  startOfISOWeek,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  differenceInDays,
  startOfDay,
  isSameDay,
} from 'date-fns';

/** Current program month number (1-based) based on m1StartDate */
export function getCurrentMonth(m1StartDate: Date): number {
  const now = new Date();
  if (now < m1StartDate) return 1;
  return differenceInCalendarMonths(now, m1StartDate) + 1;
}

/**
 * Current week-since-enrollment (1-based), matching the "Credit / Week" column
 * of the 48-week Weekly conveyer-belt content calendar. Weeks are Monday-aligned
 * (weekStartsOn: 1) since m1StartDate is always set to the enrollment's next
 * Monday (see prisma/seed.ts) and lib/cron.ts's VIDEO block only fires on Mondays.
 */
export function getCurrentWeek(m1StartDate: Date): number {
  const now = new Date();
  if (now < m1StartDate) return 1;
  return differenceInCalendarWeeks(now, m1StartDate, { weekStartsOn: 1 }) + 1;
}

export { addDays, differenceInDays, startOfDay, startOfISOWeek, isSameDay, isMonday, nextMonday };
