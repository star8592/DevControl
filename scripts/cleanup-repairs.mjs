#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assessRepairCleanup,
  cleanupRepairWorktree,
  verifyMergedRepairOnKnownGood
} from '../lib/repair-cleanup.mjs';
import { readLifecycleState } from '../lib/project-lifecycle.mjs';
import { readLatestExecution } from '../lib/project-executor.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');
const stateDir = path.resolve(baseDir, process.env.DEVCONTROL_STATE_DIR || 'state');
const selected = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : null;

async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await readFile(filePath, 'utf8')); } catch { return fallback; }
}

async function jsonMap(dir, field) {
  let names = [];
  try { names = await readdir(dir); } catch { return new Map(); }
  const output = new Map();
  for (const name of names.filter(value => value.endsWith('.json')).sort()) {
    const value = await readJson(path.join(dir, name));
    if (value?.[field]) output.set(value[field], value);
  }
  return output;
}

const discovery = await readJson(
  path.resolve(baseDir, process.env.DEVCONTROL_DISCOVERY_FILE || 'state/discovery.json'),
  { projects: [] }
);
const lifecycleState = await readLifecycleState(stateDir);
const attempts = await jsonMap(path.resolve(stateDir, 'repair-attempts'), 'signature');
const reviews = await jsonMap(path.resolve(stateDir, 'repair-reviews'), 'signature');
const cleanupDir = path.resolve(stateDir, 'repair-cleanups');
await mkdir(cleanupDir, { recursive: true });

const projects = new Map();
for (const project of discovery.projects || []) {
  projects.set(project.key, project);
  if (project.registration?.configuredKey) projects.set(project.registration.configuredKey, project);
}

const results = [];
for (const [signature, review] of reviews) {
  if (review.state !== 'MERGED') continue;
  const attempt = attempts.get(signature);
  if (!attempt) continue;
  const project = projects.get(attempt.project) || projects.get(review.project);
  if (!project) continue;
  const key = project.registration?.configuredKey || project.key;
  if (selected && key !== selected && project.key !== selected) continue;

  const target = path.resolve(cleanupDir, `${signature}.json`);
  const previous = await readJson(target);
  if (previous?.status === 'CLEANED') {
    results.push({ ...previous, skipped: true });
    continue;
  }

  const lifecycle = lifecycleState.projects?.[key] || null;
  const latestQualification = await readLatestExecution(stateDir, key);
  const eligibility = assessRepairCleanup({
    project: { ...project, key },
    review,
    attempt,
    lifecycle,
    latestQualification,
    stateDir
  });

  let outcome;
  if (!eligibility.eligible) {
    outcome = { status: 'WAITING_GATES', reasons: eligibility.reasons };
  } else {
    const verified = verifyMergedRepairOnKnownGood({
      project: { ...project, key },
      review,
      lifecycle,
      latestQualification
    });
    outcome = verified.ok
      ? cleanupRepairWorktree({ project: { ...project, key }, attempt })
      : { status: verified.state, reasons: [verified.reason] };
  }

  const record = {
    schemaVersion: 1,
    project: key,
    repo: project.repo || null,
    signature,
    reviewedState: review.state,
    mergeCommitSha: review.mergeCommitSha || null,
    repairSha: attempt.repairSha || null,
    repairBranch: attempt.branch || null,
    cleanedAt: outcome.status === 'CLEANED' ? new Date().toISOString() : null,
    checkedAt: new Date().toISOString(),
    ...outcome
  };
  await writeFile(target, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  results.push(record);
}

const ok = results.every(item => !String(item.status || '').endsWith('_FAILED'));
console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);
