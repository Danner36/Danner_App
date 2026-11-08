// Copies catalog/ into app/picker/catalogSnapshot.json so the picker works offline. Run before a
// release. A missing or unusable catalog writes nothing and exits 1. `--check` writes nothing and
// exits 1 unless the committed snapshot holds a catalog.
//
//   node app/scripts/build-catalog-snapshot.mjs [--catalog <dir>] [--out <file>] [--check]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_FILE = path.resolve(SCRIPT_DIR, '..', 'picker', 'catalogSnapshot.json');
const CATALOG_DIR = path.resolve(SCRIPT_DIR, '..', '..', 'catalog');
const SCHEMA_VERSION = 1;

function readDocument(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

// Returns the snapshot object, or throws naming what is wrong.
export function buildSnapshot(catalogDir) {
  const leaguesFile = path.join(catalogDir, 'leagues.json');
  if (!existsSync(leaguesFile)) {
    throw new Error(`${leaguesFile} does not exist`);
  }
  const leagues = readDocument(leaguesFile);
  if (leagues?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(leagues?.leagues)) {
    throw new Error('leagues.json has an unknown shape');
  }
  const teams = {};
  const teamsDir = path.join(catalogDir, 'teams');
  for (const row of leagues.leagues) {
    const file = path.join(teamsDir, `${row.key}.json`);
    if (!existsSync(file)) {
      throw new Error(`teams/${row.key}.json does not exist`);
    }
    const document = readDocument(file);
    if (
      document?.schemaVersion !== SCHEMA_VERSION ||
      document?.league !== row.key ||
      !Array.isArray(document?.teams) ||
      document.teams.length === 0
    ) {
      throw new Error(`teams/${row.key}.json has an unknown shape`);
    }
    teams[row.key] = document;
  }
  const expected = new Set(leagues.leagues.map((row) => `${row.key}.json`));
  const extra = readdirSync(teamsDir).filter((name) => !expected.has(name));
  if (extra.length > 0) {
    throw new Error(`teams/ holds files no league names: ${extra.join(', ')}`);
  }
  return { leagues, schemaVersion: SCHEMA_VERSION, teams };
}

export function snapshotHoldsCatalog(snapshot) {
  return (
    Array.isArray(snapshot?.leagues?.leagues) &&
    snapshot.leagues.leagues.length > 0 &&
    snapshot.leagues.leagues.every((row) => (snapshot.teams?.[row.key]?.teams?.length ?? 0) > 0)
  );
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : path.resolve(args[index + 1]);
}

function main() {
  const args = process.argv.slice(2);
  const out = option(args, '--out', SNAPSHOT_FILE);
  if (args.includes('--check')) {
    if (!snapshotHoldsCatalog(readDocument(out))) {
      console.error(`catalog snapshot: ${path.basename(out)} holds no catalog. Run npm run build:catalog-snapshot.`);
      return 1;
    }
    console.log('catalog snapshot: holds a catalog');
    return 0;
  }
  let snapshot;
  try {
    snapshot = buildSnapshot(option(args, '--catalog', CATALOG_DIR));
  } catch (error) {
    console.error(`catalog snapshot: nothing written: ${error.message}`);
    return 1;
  }
  writeFileSync(out, `${JSON.stringify(snapshot)}\n`);
  console.log(`catalog snapshot: wrote ${path.basename(out)}`);
  return 0;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
