export { slugify } from './slug';

/**
 * Generic, text-only, red/white-branded greeting used when a festival is due
 * but no Content library template matches it yet. Keeps parents getting
 * something rather than being silently skipped — lib/cron.ts also logs an
 * admin reminder notification whenever this path is used.
 */
export function getFestiveFallbackContent(festivalName: string): { title: string; body: string } {
  return {
    title: `Happy ${festivalName} from Ebright Academy!`,
    body: `Dear {parent_first_name}, wishing you and {{student_name}} a joyful ${festivalName}! — Team Ebright Academy`,
  };
}
