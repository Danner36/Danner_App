// Reads and writes the app's AsyncStorage database on a debuggable install, through `run-as`. The
// emulator image has no root and no sqlite3 binary, so the database is copied out, edited with
// node:sqlite, and copied back with the app stopped.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const PACKAGE = 'com.example.location_helper';
const DATABASE = 'RKStorage';
const TABLE = 'catalystLocalStorage';
const SIDE_FILES = ['', '-wal', '-shm'];
const DEVICE_TEMP = '/data/local/tmp/danner-rkstorage';

function adbBytes(args, options = {}) {
  return execFileSync('adb', args, {
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function runAs(command) {
  return adbBytes(['shell', `run-as ${PACKAGE} ${command}`]).toString('utf8');
}

export function isInspectable() {
  try {
    runAs('id');
    return true;
  } catch {
    return false;
  }
}

function pullDatabase(directory) {
  const local = path.join(directory, DATABASE);
  for (const suffix of SIDE_FILES) {
    const remote = `databases/${DATABASE}${suffix}`;
    let body;
    try {
      body = adbBytes(['exec-out', `run-as ${PACKAGE} cat ${remote}`]);
    } catch {
      continue;
    }
    if (body.length > 0 && !body.subarray(0, 40).toString('utf8').includes('No such file')) {
      writeFileSync(`${local}${suffix}`, body);
    }
  }
  return existsSync(local) ? local : undefined;
}

// Every key and value in the store. An empty map when the database does not exist yet.
export function readStorage() {
  const directory = mkdtempSync(path.join(tmpdir(), 'rkstorage-'));
  try {
    const local = pullDatabase(directory);
    if (!local) {
      return new Map();
    }
    const database = new DatabaseSync(local);
    try {
      return new Map(
        database.prepare(`SELECT key, value FROM ${TABLE}`).all().map((row) => [row.key, row.value]),
      );
    } finally {
      database.close();
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

// Sets keys in the store. A key mapped to null is removed. The app must be stopped, and the
// database must already exist.
export function writeStorage(values) {
  const directory = mkdtempSync(path.join(tmpdir(), 'rkstorage-'));
  try {
    const local = pullDatabase(directory);
    if (!local) {
      throw new Error('The app has not created its storage yet.');
    }
    const database = new DatabaseSync(local);
    try {
      database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      database.exec('PRAGMA journal_mode=DELETE');
      const upsert = database.prepare(`INSERT OR REPLACE INTO ${TABLE} (key, value) VALUES (?, ?)`);
      const remove = database.prepare(`DELETE FROM ${TABLE} WHERE key = ?`);
      for (const [key, value] of Object.entries(values)) {
        if (value === null) {
          remove.run(key);
        } else {
          upsert.run(key, value);
        }
      }
    } finally {
      database.close();
    }
    const staged = path.join(directory, 'staged');
    copyFileSync(local, staged);
    adbBytes(['push', staged, DEVICE_TEMP]);
    adbBytes(['shell', `chmod 644 ${DEVICE_TEMP}`]);
    runAs(`cp ${DEVICE_TEMP} databases/${DATABASE}`);
    adbBytes(['shell', `rm -f ${DEVICE_TEMP}`]);
    runAs(`rm -f databases/${DATABASE}-wal databases/${DATABASE}-shm`);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

export function fileExistsInApp(relativePath) {
  try {
    runAs(`ls ${relativePath}`);
    return true;
  } catch {
    return false;
  }
}
