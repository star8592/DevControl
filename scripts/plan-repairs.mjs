#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairPlanIssueComment } from '../lib/repair-report.mjs';
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
const githubComments = process.env.DEVCONTROL_GITHUB_REPAIR_PLAN_COMMENTS === '1';
const token = process.env.GITHUB_TOKEN || '';

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function saveJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function postRepairComment(plan, issue) {
  if (!githubComments || !token || !plan.project?.repo || !issue?.number) return null;
  const response = await fetch(
    `https://api.github.com/repos/${plan.project.repo}/issues/${issue.number}/comments`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'DevControl/0.7'
      },
      body: JSON.stringify({ body: repairPlanIssueComment(plan) })
    }
  );
  if (!response.ok) {
    throw new Error(`GitHub repair comment failed: HTTP ${response.status}`);
  }
  const data = await response.json();
  return { id: data.id, url: data.html_url };
}

let names = [];
try {
  names = await readdir(queueDir);
} catch {
  console.log(JSON.stringify({ ok: true, message: 'AI failure queue is empty' }, null, 2));
  process.exit(0);
}

const failureIssues = await readJson(
  path.resolve(stateDir, 'reported-failures.json'),
  {}
);
const reportedPlansFile = path.resolve(stateDir, 'reported-repair-plans.json');
const reportedPlans = await readJson(reportedPlansFile, {});

const results = [];
for (const name of names.filter(name => name.endsWith('.json')).sort()) {
  const packet = JSON.parse(await readFile(path.join(queueDir, name), 'utf8'));
  if (selected && packet.project?.key !== selected) continue;
  if (!packet.signature) continue;

  let plan = force ? null : await loadRepairPlan(stateDir, packet.signature);
  let planStatus = 'SKIPPED';
  let filePath = null;
  if (!plan) {
    plan = await buildRepairPlan({ packet, provider, timeoutMs });
    filePath = await saveRepairPlan(stateDir, plan);
    planStatus = 'PLANNED';
  }

  let comment = reportedPlans[packet.signature] || null;
  let reportError = null;
  const failureIssue = failureIssues[packet.signature] || null;
  if (!comment && githubComments && failureIssue) {
    try {
      comment = await postRepairComment(plan, failureIssue);
      if (comment) {
        reportedPlans[packet.signature] = {
          ...comment,
          project: packet.project?.key,
          repo: packet.project?.repo,
          issue: failureIssue.number,
          provider: plan.provider,
          reportedAt: new Date().toISOString()
        };
      }
    } catch (error) {
      reportError = String(error.message || error);
    }
  }

  results.push({
    project: packet.project?.key,
    signature: packet.signature,
    status: planStatus,
    provider: plan.provider,
    confidence: plan.confidence,
    file: filePath,
    plannerError: plan.plannerError,
    failureIssue: failureIssue?.url || null,
    repairComment: comment?.url || null,
    reportError
  });
}

await saveJson(reportedPlansFile, reportedPlans);
console.log(JSON.stringify({
  ok: results.every(item => !item.reportError),
  provider,
  githubComments,
  results
}, null, 2));
