/**
 * Next.js 14 instrumentation hook.
 * Runs once when the Node server starts (both `next dev` and `next start`).
 *
 * We use it to register the in-process auto-blast scheduler defined in
 * lib/autoblast.ts. See the SERVERLESS CAVEAT comment in that file — this
 * hook does NOT run on serverless / edge deployments.
 */
export async function register() {
  // Only run in the Node runtime (skip edge).
  // The dynamic import prevents the bundler from trying to resolve Node.js-specific
  // modules (like 'stream' from nodemailer) in non-Node.js environments.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerAutoBlastScheduler } = await import('./lib/autoblast');
    await registerAutoBlastScheduler();

    const { registerCronScheduler } = await import('./lib/cronScheduler');
    await registerCronScheduler();
  }
}
