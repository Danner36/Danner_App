import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const harnessDirectory = fileURLToPath(new URL('.', import.meta.url));
const appDirectory = fileURLToPath(new URL('../../app/', import.meta.url));
const expoCliPath = fileURLToPath(
  new URL('../../app/node_modules/expo/bin/cli', import.meta.url),
);
const serverPath = fileURLToPath(new URL('./server.mjs', import.meta.url));
const scenario = process.argv[2] ?? 'today';
if (!new Set(['delayed', 'final', 'live', 'ready', 'today']).has(scenario)) {
  throw new Error(`Unknown Guardians harness scenario: ${scenario}`);
}
const harnessUrl = `http://10.0.2.2:8108/guardians?scenario=${scenario}`;
const sourcesUrl = 'http://10.0.2.2:8108/guardians-sources.json';

const server = spawn(process.execPath, [serverPath], {
  cwd: harnessDirectory,
  stdio: 'inherit',
});

const waitForServer = async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:8108/health');
      if (response.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Guardians harness did not start.');
};

const waitForExit = (process, label) =>
  new Promise((resolve, reject) => {
    process.once('error', (error) =>
      reject(new Error(`${label} could not start: ${error.message}`)),
    );
    process.once('exit', (code) => resolve(code ?? 1));
  });

let metro;
let nativeBuild;

try {
  await waitForServer();
  nativeBuild = spawn(
    process.execPath,
    [expoCliPath, 'run:android', '--no-bundler'],
    {
      cwd: appDirectory,
      env: {
        ...process.env,
        EXPO_PUBLIC_GUARDIANS_SOURCES_URL: sourcesUrl,
        EXPO_PUBLIC_GUARDIANS_TEST_URL: harnessUrl,
      },
      stdio: 'inherit',
    },
  );
  const buildExitCode = await waitForExit(nativeBuild, 'Android build');
  if (buildExitCode !== 0) {
    throw new Error(`Android build exited with code ${buildExitCode}.`);
  }

  metro = spawn(
    process.execPath,
    [expoCliPath, 'start', '--dev-client', '--android', '--port', '8081'],
    {
      cwd: appDirectory,
      env: {
        ...process.env,
        EXPO_PUBLIC_GUARDIANS_SOURCES_URL: sourcesUrl,
        EXPO_PUBLIC_GUARDIANS_TEST_URL: harnessUrl,
      },
      stdio: 'inherit',
    },
  );

  const exitCode = await waitForExit(metro, 'Expo development server');
  process.exitCode = exitCode;
} finally {
  metro?.kill();
  nativeBuild?.kill();
  server.kill();
}
