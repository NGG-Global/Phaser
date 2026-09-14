import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const androidDirectory = fileURLToPath(new URL('../android/', import.meta.url));
const windows = process.platform === 'win32';
const executable = windows ? (process.env.ComSpec ?? 'cmd.exe') : './gradlew';
const args = windows ? ['/d', '/s', '/c', 'gradlew.bat assembleDebug'] : ['assembleDebug'];
const result = spawnSync(executable, args, {
  cwd: androidDirectory,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
