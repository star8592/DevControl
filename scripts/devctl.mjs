#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');

function run(script, args = []) {
  const result = spawnSync(process.execPath, [path.resolve(baseDir, script), ...args], {
    cwd: baseDir,
    stdio: 'inherit',
    env: process.env
  });
  process.exit(result.status ?? 1);
}

const [command = 'status', ...args] = process.argv.slice(2);

if (command === 'discover') run('scripts/discover-projects.mjs', args);
if (command === 'qualify') run('scripts/qualify-projects.mjs', args);
if (command === 'check') {
  const result = spawnSync('npm', ['run', 'check'], {
    cwd: baseDir,
    stdio: 'inherit',
    env: process.env
  });
  process.exit(result.status ?? 1);
}

if (command === 'status') {
  const response = await fetch(
    `http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || '8787'}/api/status`
  ).catch(() => null);
  if (!response?.ok) {
    console.error('DevControl server is unavailable; try systemctl --user status devcontrol.service');
    process.exit(1);
  }
  console.log(JSON.stringify(await response.json(), null, 2));
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
console.error('Commands: discover, qualify, status, check');
process.exit(2);
