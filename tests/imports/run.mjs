// Imports every pure module under plain Node, the way the tests and tools load them. A runtime React
// Native import or an extensionless relative specifier fails here.
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = fileURLToPath(new URL('../../app/', import.meta.url));

function tsFiles(relativeDirectory) {
  const directory = path.join(appRoot, relativeDirectory);
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    const relative = path.join(relativeDirectory, name);
    if (statSync(full).isDirectory()) {
      return tsFiles(relative);
    }
    return name.endsWith('.ts') && !name.endsWith('.d.ts') ? [relative] : [];
  });
}

const PURE_MODULES = [
  ...tsFiles('leagues'),
  ...tsFiles('team/engine'),
  ...tsFiles('scoreboards').filter((file) => !file.endsWith('.tsx')),
  'hub/hubGrid.ts',
  'logos/logoPlan.ts',
  'picker/catalogModel.ts',
  ...tsFiles('selection').filter((file) => !file.endsWith('store.ts')),
  'streams/sources.ts',
  'tvLocation/destination.ts',
];

assert.ok(PURE_MODULES.length > 20, 'the pure module list is unexpectedly short');
for (const relative of PURE_MODULES) {
  const url = pathToFileURL(path.join(appRoot, relative)).href;
  await assert.doesNotReject(() => import(url), `importing ${relative}`);
}

process.stdout.write(`Imports passed: ${PURE_MODULES.length} pure modules.\n`);
