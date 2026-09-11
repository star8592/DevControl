#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  executeProjectQualification,
  readLatestExecution
} from '../lib/project-executor.mjs';
import {
  chooseQualificationCommands,
  learnFromQualification,
  loadProjectPlaybook
} from '../lib/project-learner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');
const discoveryFile = path.resolve(
  baseDir,
  process.env.DEVCONTROL_DISCOVERY_FILE || 'state/discovery.json'
);
const stateDir = path.resolve(
  baseDir,
  process.env.DEVCONTROL_STATE_DIR || 'state'
);
const selected = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : null;
const allowManaged = process.argv.includes('--managed');
const force = process.argv.includes('--force');
const timeoutMs = Number(
  process.env.DEVCONTROL_QUALIFY_TIMEOUT_MS || 15 * 60 * 1000
);

let report;
try {
  report = JSON.parse(await readFile(discoveryFile, 'utf8'));
} catch {
  console.error(`Discovery report not found: ${discoveryFile}`);
  console.error('Run: npm run discover');
  process.exit(2);
}

const eligible = (report.projects || []).filter(project => {
  if (selected && project.key !== selected && project.registration?.configuredKey !== selected) {
    return false;
  }
  if (!project.autonomy?.autoQualify) return false;
  if (project.autonomy.level === 'QUALIFY') return true;
  return allowManaged && project.autonomy.level === 'MANAGED';
});

if (!eligible.length) {
  console.log(JSON.stringify({
    ok: true,
    message: 'no projects currently eligible for automatic qualification',
    selected: selected || null
  }, null, 2));
  process.exit(0);
}

const results = [];
for (const project of eligible) {
  const key = project.registration?.configuredKey || project.key;
  const executionProject = { ...project, key };
  const latest = await readLatestExecution(stateDir, key);
  if (
    !force &&
    !project.dirty &&
    latest?.status === 'PASS' &&
    latest?.project?.sha &&
    latest.project.sha === project.sha
  ) {
    results.push({
      project: key,
      status: 'SKIPPED',
      reason: 'clean SHA already qualified',
      runId: latest.runId,
      sha: project.sha
    });
    continue;
  }
  const playbook = await loadProjectPlaybook(stateDir, key);
  const commands = chooseQualificationCommands(project, playbook);
  if (!commands.length) continue;

  console.log(`== qualify ${key} ==`);
  for (const command of commands) console.log(`  $ ${command}`);

  try {
    const result = await executeProjectQualification({
      project: executionProject,
      commands,
      stateDir,
      timeoutMs
    });
    const learned = await learnFromQualification({
      stateDir,
      project: executionProject,
      result
    });
    results.push({
      project: key,
      status: result.status,
      runId: result.runId,
      failedCommand: result.failedCommand,
      runPassRate: learned.runPassRate,
      preferredQualification: learned.preferredQualification
    });
  } catch (error) {
    results.push({
      project: key,
      status: 'ERROR',
      error: String(error.message || error)
    });
  }
}

const ok = results.every(x => ['PASS', 'SKIPPED'].includes(x.status));
console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);
