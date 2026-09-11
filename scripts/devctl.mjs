#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { clearQuarantine } from '../lib/project-lifecycle.mjs';
import { loadLocalControlState } from '../lib/local-state.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');
const stateDir = path.resolve(baseDir, process.env.DEVCONTROL_STATE_DIR || 'state');

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
if (command === 'sync') run('scripts/sync-projects.mjs', args);
if (command === 'qualify') run('scripts/qualify-projects.mjs', args);
if (command === 'reconcile') run('scripts/reconcile.mjs', args);
if (command === 'failures') run('scripts/report-failures.mjs', args);
if (command === 'repairs') run('scripts/plan-repairs.mjs', args);
if (command === 'auto-fix') run('scripts/auto-fix.mjs', args);
if (command === 'repair-publish') run('scripts/publish-repairs.mjs', args);
if (command === 'check') {
  const result = spawnSync('npm', ['run', 'check'], {
    cwd: baseDir,
    stdio: 'inherit',
    env: process.env
  });
  process.exit(result.status ?? 1);
}

if (command === 'local') {
  console.log(JSON.stringify(await loadLocalControlState(baseDir), null, 2));
  process.exit(0);
}

if (command === 'quarantine-clear') {
  const project = args[0];
  if (!project) {
    console.error('Usage: devctl quarantine-clear <project>');
    process.exit(2);
  }
  const cleared = await clearQuarantine(stateDir, project);
  console.log(JSON.stringify({ ok: cleared, project }, null, 2));
  process.exit(cleared ? 0 : 1);
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
console.error(
  'Commands: discover, sync, qualify, reconcile, failures, repairs, auto-fix, repair-publish, local, quarantine-clear, status, check'
);
process.exit(2);
