// Runs the engine suites in order; a suite fails the run by throwing. The cases ported from the
// three fixed-team snapshot suites keep their original assertions.
await import('./guardians.mjs');
await import('./patriots.mjs');
await import('./cyclones.mjs');
await import('./engine.mjs');
await import('./scoreHeader.mjs');
await import('./winChance.mjs');

process.stdout.write('Team engine assertions passed.\n');
