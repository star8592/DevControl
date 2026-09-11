#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildRepairPlan,
  loadRepairPlan,
  saveRepairPlan
} from '../lib/repair-supervisor.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');
const stateDir = path.resolve(baseDir, process.env.DEVCONTROL_STATE_DIR || 'state');
const queueDir = path.resolve(stateDir, 'ai-queue');
const provider = String(process.env.DEVCONTROL_REPAIR_PLANNER || 'heuristic').toLowerCase();
const selected = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : null;
const force = process.argv.includes('--force');
const timeoutMs = Number(process.env.DEVCONTROL_REPAIR_PLAN_TIMEOUT_MS || 180000);

let names = [];
try {
  names = await readdir(queueDir);
} catch {
  console.log(JSON.stringify({ ok: true, message: 'AI failure queue is empty' }, null, 2));
  process.exit(0);
}

const results = [];
for (const name of names.filter(name => name.endsWith('.json')).sort()) {
  const packet = JSON.parse(await readFile(path.join(queueDir, name), 'utf8'));
  if (selected && packet.project?.key !== selected) continue;
  if (!packet.signature) continue;

  if (!force) {
    const existing = await loadRepairPlan(stateDir, packet.signature);
    if (existing) {
      results.push({
        project: packet.project?.key,
        signature: packet.signature,
        status: 'SKIPPED',
        provider: existing.provider
      });
      continue;
    }
  }

  const plan = await buildRepairPlan({ packet, provider, timeoutMs });
  const filePath = await saveRepairPlan(stateDir, plan);
  results.push({
    project: packet.project?.key,
    signature: packet.signature,
    status: 'PLANNED',
    provider: plan.provider,
    confidence: plan.confidence,
    file: filePath,
    plannerError: plan.plannerError
  });
}

console.log(JSON.stringify({ ok: true, provider, results }, null, 2));
