#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishRepairCandidate } from '../lib/repair-candidate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');
const stateDir = path.resolve(baseDir, process.env.DEVCONTROL_STATE_DIR || 'state');
const pushEnabled = process.env.DEVCONTROL_AUTO_PUSH_REPAIR_BRANCH === '1';
const prEnabled = process.env.DEVCONTROL_AUTO_CREATE_REPAIR_PR === '1';
const token = process.env.GITHUB_TOKEN || '';
const selected = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : null;

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
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

if (!pushEnabled && !prEnabled) {
  console.log(JSON.stringify({
    ok: true,
    enabled: false,
    message: 'repair candidate publication is disabled; local validated candidates remain untouched'
  }, null, 2));
  process.exit(0);
}

if (prEnabled && !pushEnabled) {
  console.log(JSON.stringify({
    ok: false,
    enabled: true,
    error: 'DEVCONTROL_AUTO_CREATE_REPAIR_PR=1 requires DEVCONTROL_AUTO_PUSH_REPAIR_BRANCH=1'
  }, null, 2));
  process.exit(2);
}

const discovery = await readJson(
  path.resolve(baseDir, process.env.DEVCONTROL_DISCOVERY_FILE || 'state/discovery.json'),
  { projects: [] }
);
const attempts = await jsonMap(path.resolve(stateDir, 'repair-attempts'), 'signature');
const packets = await jsonMap(path.resolve(stateDir, 'ai-queue'), 'signature');
const plans = await jsonMap(path.resolve(stateDir, 'repair-plans'), 'signature');
const candidatesDir = path.resolve(stateDir, 'repair-candidates');
await mkdir(candidatesDir, { recursive: true });

const projects = new Map();
for (const project of discovery.projects || []) {
  projects.set(project.key, project);
  if (project.registration?.configuredKey) {
    projects.set(project.registration.configuredKey, project);
  }
}

const results = [];
for (const [signature, attempt] of attempts) {
  if (!['CANDIDATE_READY', 'PASS_LOCAL_PUSH_FAILED'].includes(attempt.status)) continue;
  const packet = packets.get(signature);
  const plan = plans.get(signature);
  if (!packet || !plan) continue;
  const project = projects.get(attempt.project) || projects.get(packet.project?.key);
  if (!project) continue;
  const key = project.registration?.configuredKey || project.key;
  if (selected && key !== selected && project.key !== selected) continue;

  const candidateFile = path.resolve(candidatesDir, `${signature}.json`);
  const previous = await readJson(candidateFile);
  if (previous?.pr?.number) {
    results.push({
      project: key,
      signature,
      status: 'SKIPPED',
      reason: `draft PR already recorded: #${previous.pr.number}`,
      pr: previous.pr
    });
    continue;
  }

  let published;
  try {
    published = await publishRepairCandidate({
      project: { ...project, key },
      attempt,
      packet,
      plan,
      token,
      pushEnabled,
      prEnabled
    });
  } catch (error) {
    published = { status: 'ERROR', error: String(error.message || error) };
  }

  const record = {
    schemaVersion: 1,
    project: key,
    repo: project.repo || null,
    signature,
    recordedAt: new Date().toISOString(),
    pushEnabled,
    prEnabled,
    ...published
  };
  if (!['BLOCKED', 'LOCAL_ONLY'].includes(published.status)) {
    await writeFile(candidateFile, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  }
  results.push(record);
}

const ok = results.every(item => !['ERROR', 'PUSH_FAILED'].includes(item.status));
console.log(JSON.stringify({ ok, enabled: true, pushEnabled, prEnabled, results }, null, 2));
process.exit(ok ? 0 : 1);
