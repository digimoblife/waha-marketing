/**
 * Runs once when the Next.js server starts.
 * Resumes broadcast campaigns that were RUNNING when the previous process stopped.
 */
export async function register() {
  // The nodejs-only import must sit inside this check so the Edge bundle never includes Prisma.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { resumeRunningBroadcasts } = await import('./lib/broadcast-worker');

    // Give the server a moment to finish booting before sending anything.
    setTimeout(() => {
      resumeRunningBroadcasts()
        .then((resumed) => {
          if (resumed.length > 0) {
            console.log(`[Startup] Resumed ${resumed.length} running broadcast campaign(s)`);
          }
        })
        .catch((err) => console.error('[Startup] Could not resume running broadcasts:', err));
    }, 5000).unref?.();
  }
}
