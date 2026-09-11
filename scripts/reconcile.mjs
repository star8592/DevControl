#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');

function run(script, args = [], { allowFailure = false } = {}) {
  const result = spawnSync(process.execPath, [path.resolve(baseDir, script), ...args], {
    cwd: baseDir,
    env: process.env,
    stdio: 'inherit'
  });
  const status = result.status ?? 1;
  if (status !== 0 && !allowFailure) process.exit(status);
  return status;
}

run('scripts/discover-projects.mjs');
run('scripts/sync-projects.mjs', ['--managed']);
run('scripts/discover-projects.mjs');
const qualify = run('scripts/qualify-projects.mjs', ['--managed'], { allowFailure: true });
run('scripts/report-failures.mjs', [], { allowFailure: true });
run('scripts/plan-repairs.mjs', [], { allowFailure: true });
run('scripts/render-autonomy-dashboard.mjs', [], { allowFailure: true });

if (qualify !== 0) {
  console.log('DevControl reconcile completed with qualification failures; failures were queued.');
}
process.exit(0);
