import {
  nextMonday,
  isMonday,
  addDays,
  startOfISOWeek,
  differenceInCalendarMonths,
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

export { addDays, differenceInDays, startOfDay, startOfISOWeek, isSameDay, isMonday, nextMonday };
