#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { executeAutoFix } from '../lib/repair-executor.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');
const stateDir = path.resolve(baseDir, process.env.DEVCONTROL_STATE_DIR || 'state');
const enabled = process.env.DEVCONTROL_AUTO_FIX === '1';
const pushBranch = process.env.DEVCONTROL_AUTO_PUSH_REPAIR_BRANCH === '1';
const selected = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : null;
const codexTimeoutMs = Number(process.env.DEVCONTROL_AUTO_FIX_TIMEOUT_MS || 600000);
const qualifyTimeoutMs = Number(process.env.DEVCONTROL_QUALIFY_TIMEOUT_MS || 900000);

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function jsonFiles(dir) {
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const values = [];
  for (const name of names.filter(name => name.endsWith('.json')).sort()) {
    const value = await readJson(path.join(dir, name));
    if (value) values.push(value);
  }
  return values;
}

if (!enabled) {
  console.log(JSON.stringify({
    ok: true,
    enabled: false,
    message: 'AUTO_FIX is disabled; set DEVCONTROL_AUTO_FIX=1 to opt in'
  }, null, 2));
  process.exit(0);
}

const discovery = await readJson(
  path.resolve(baseDir, process.env.DEVCONTROL_DISCOVERY_FILE || 'state/discovery.json'),
  { projects: [] }
);
const packets = await jsonFiles(path.resolve(stateDir, 'ai-queue'));
const plans = await jsonFiles(path.resolve(stateDir, 'repair-plans'));
const attemptsDir = path.resolve(stateDir, 'repair-attempts');
await mkdir(attemptsDir, { recursive: true });

const packetsBySignature = new Map(packets.map(packet => [packet.signature, packet]));
const projects = new Map();
for (const project of discovery.projects || []) {
  projects.set(project.key, project);
  if (project.registration?.configuredKey) {
    projects.set(project.registration.configuredKey, project);
  }
}

const results = [];
for (const plan of plans) {
  if (!plan.signature) continue;
  const packet = packetsBySignature.get(plan.signature);
  if (!packet) continue;
  const project = projects.get(packet.project?.key);
  if (!project) continue;
  const key = project.registration?.configuredKey || project.key;
  if (selected && key !== selected && project.key !== selected) continue;

  const attemptFile = path.resolve(attemptsDir, `${plan.signature}.json`);
  const previous = await readJson(attemptFile);
  if (previous) {
    results.push({
      project: key,
      signature: plan.signature,
      status: 'SKIPPED',
      reason: `repair attempt already recorded: ${previous.status}`,
      branch: previous.branch || null
    });
    continue;
  }

  let result;
  try {
    result = await executeAutoFix({
      project: { ...project, key },
      packet,
      plan,
      stateDir,
      codexTimeoutMs,
      qualifyTimeoutMs,
      pushBranch
    });
  } catch (error) {
    result = {
      status: 'ERROR',
      error: String(error.message || error)
    };
  }

  const record = {
    schemaVersion: 1,
    project: key,
    repo: project.repo || null,
    signature: plan.signature,
    failureSha: packet.project?.sha || null,
    attemptedAt: new Date().toISOString(),
    autoPushEnabled: pushBranch,
    ...result
  };

  if (result.status !== 'BLOCKED') {
    await writeFile(attemptFile, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  }
  results.push(record);
}

console.log(JSON.stringify({
  ok: results.every(item => !['ERROR'].includes(item.status)),
  enabled: true,
  pushBranch,
  results
}, null, 2));
