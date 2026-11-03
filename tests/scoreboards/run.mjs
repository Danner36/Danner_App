// Runs the arena board suites in order; a suite fails the run by throwing.
await import('./board.mjs');
await import('./layout.mjs');

console.log('Scoreboard assertions passed.');
