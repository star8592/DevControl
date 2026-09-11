#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  executeProjectQualification,
  readLatestExecution
} from '../lib/project-executor.mjs';
import {
  inspectProjectGit,
  recordQualificationOutcome
} from '../lib/project-lifecycle.mjs';
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
  let gitState;
  try {
    gitState = inspectProjectGit(project);
  } catch (error) {
    results.push({
      project: key,
      status: 'ERROR',
      error: String(error.message || error)
    });
    continue;
  }

  if (gitState.dirty) {
    results.push({
      project: key,
      status: 'SKIPPED',
      reason: 'working tree is dirty; automatic qualification will not execute',
      sha: gitState.sha
    });
    continue;
  }

  const executionProject = {
    ...project,
    key,
    sha: gitState.sha,
    branch: gitState.branch,
    dirty: gitState.dirty
  };
  const latest = await readLatestExecution(stateDir, key);
  if (
    !force &&
    latest?.status === 'PASS' &&
    latest?.project?.sha &&
    latest.project.sha === gitState.sha
  ) {
    results.push({
      project: key,
      status: 'SKIPPED',
      reason: 'clean SHA already qualified',
      runId: latest.runId,
      sha: gitState.sha
    });
    continue;
  }

  const playbook = await loadProjectPlaybook(stateDir, key);
  const commands = chooseQualificationCommands(executionProject, playbook);
  if (!commands.length) {
    results.push({
      project: key,
      status: 'SKIPPED',
      reason: 'no safe qualification commands available',
      sha: gitState.sha
    });
    continue;
  }

  console.log(`== qualify ${key} @ ${gitState.sha.slice(0, 10)} ==`);
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
    const lifecycle = await recordQualificationOutcome({
      stateDir,
      project: executionProject,
      result
    });
    results.push({
      project: key,
      status: result.status,
      runId: result.runId,
      sha: gitState.sha,
      failedCommand: result.failedCommand,
      runPassRate: learned.runPassRate,
      preferredQualification: learned.preferredQualification,
      lifecycle
    });
  } catch (error) {
    results.push({
      project: key,
      status: 'ERROR',
      sha: gitState.sha,
      error: String(error.message || error)
    });
  }
}

const ok = results.every(x => ['PASS', 'SKIPPED'].includes(x.status));
console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);
