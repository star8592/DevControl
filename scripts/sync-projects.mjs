#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { syncProjectFastForward } from '../lib/project-lifecycle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');
const stateDir = path.resolve(baseDir, process.env.DEVCONTROL_STATE_DIR || 'state');
const discoveryFile = path.resolve(
  baseDir,
  process.env.DEVCONTROL_DISCOVERY_FILE || 'state/discovery.json'
);
const selected = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : null;
const allowManaged = process.argv.includes('--managed');

let report;
try {
  report = JSON.parse(await readFile(discoveryFile, 'utf8'));
} catch {
  console.error(`Discovery report not found: ${discoveryFile}`);
  process.exit(2);
}

const eligible = (report.projects || []).filter(project => {
  const key = project.registration?.configuredKey || project.key;
  if (selected && key !== selected && project.key !== selected) return false;
  if (!project.repo) return false;
  if (project.autonomy?.level === 'QUALIFY') return true;
  return allowManaged && project.autonomy?.level === 'MANAGED';
});

const results = [];
for (const project of eligible) {
  const key = project.registration?.configuredKey || project.key;
  try {
    const result = await syncProjectFastForward({
      project: { ...project, key },
      stateDir
    });
    results.push({ project: key, ...result });
  } catch (error) {
    results.push({
      project: key,
      status: 'ERROR',
      error: String(error.message || error)
    });
  }
}

const ok = results.every(item => ![
  'ERROR',
  'FETCH_FAILED',
  'FAST_FORWARD_FAILED'
].includes(item.status));
console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);
