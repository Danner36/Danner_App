// Prints the games whose Get video runs found no video, from the Worker's GET /missed.
//
//   WORKER_URL=<worker url> APP_KEY=<app key> node scripts/missed-games.mjs [days]
//
// The URL and key are read from the environment only and are never printed.

const workerUrl = process.env.WORKER_URL?.trim();
const appKey = process.env.APP_KEY?.trim();
const days = Number(process.argv[2] ?? 7);

if (!workerUrl || !appKey) {
  process.stderr.write('Set WORKER_URL and APP_KEY in the environment.\n');
  process.exit(1);
}

const response = await fetch(`${workerUrl.replace(/\/+$/, '')}/missed?days=${Number.isInteger(days) ? days : 7}`, {
  headers: { 'X-App-Key': appKey },
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok) {
  process.stderr.write(`The Worker answered ${response.status}.\n`);
  process.exit(1);
}
const { games, stillMissing } = await response.json();
process.stdout.write(`${stillMissing} of ${games.length} games from the last ${days} days still have no video.\n\n`);
for (const game of games) {
  const who = Object.entries(game.origins ?? {})
    .map(([origin, count]) => `${origin} ${count}`)
    .join(', ');
  const status = game.foundLaterAt ? `found later ${game.foundLaterAt.slice(0, 16)}` : 'STILL MISSING';
  process.stdout.write(
    `${game.officialDate ?? '????-??-??'}  ${game.team}${game.sport ? ` ${game.sport}` : ''} vs ${game.opponent ?? '?'}` +
      `  (event ${game.eventId})  ${game.lastCode} x${game.attempts} [${who}]  ${status}\n`,
  );
}
