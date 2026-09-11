#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildFailurePacket,
  failureIssueBody
} from '../lib/failure-intelligence.mjs';
import { loadProjectPlaybook } from '../lib/project-learner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');
const stateDir = path.resolve(baseDir, process.env.DEVCONTROL_STATE_DIR || 'state');
const latestDir = path.resolve(stateDir, 'latest');
const selected = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : null;
const githubIssues = process.env.DEVCONTROL_GITHUB_FAILURE_ISSUES === '1';
const token = process.env.GITHUB_TOKEN || '';

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function loadReported() {
  return await readJson(path.resolve(stateDir, 'reported-failures.json')) || {};
}

async function saveReported(value) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    path.resolve(stateDir, 'reported-failures.json'),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
}

async function createGithubIssue(packet) {
  if (!githubIssues || !token || !packet.project.repo) return null;
  const response = await fetch(
    `https://api.github.com/repos/${packet.project.repo}/issues`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'DevControl/0.5'
      },
      body: JSON.stringify({
        title: `[devcontrol] qualification failure ${String(packet.project.sha || '').slice(0, 8)}`,
        body: failureIssueBody(packet)
      })
    }
  );
  if (!response.ok) {
    throw new Error(`GitHub issue create failed: HTTP ${response.status}`);
  }
  const data = await response.json();
  return { number: data.number, url: data.html_url };
}

let files = [];
try {
  files = await readdir(latestDir);
} catch {
  console.log(JSON.stringify({ ok: true, message: 'no qualification results yet' }, null, 2));
  process.exit(0);
}

const reported = await loadReported();
const results = [];
for (const name of files.filter(name => name.endsWith('.json'))) {
  const result = await readJson(path.join(latestDir, name));
  if (!result || result.status !== 'FAIL') continue;
  if (selected && result.project?.key !== selected) continue;

  const playbook = await loadProjectPlaybook(stateDir, result.project.key);
  const { packet, filePath } = await buildFailurePacket({
    stateDir,
    result,
    playbook
  });

  let issue = reported[packet.signature] || null;
  if (!issue && githubIssues) {
    try {
      issue = await createGithubIssue(packet);
      if (issue) {
        reported[packet.signature] = {
          ...issue,
          project: packet.project.key,
          sha: packet.project.sha,
          reportedAt: new Date().toISOString()
        };
      }
    } catch (error) {
      results.push({
        project: packet.project.key,
        signature: packet.signature,
        packet: filePath,
        issue: null,
        reportError: String(error.message || error)
      });
      continue;
    }
  }

  results.push({
    project: packet.project.key,
    signature: packet.signature,
    categories: packet.failure.categories,
    packet: filePath,
    issue
  });
}

await saveReported(reported);
console.log(JSON.stringify({ ok: true, results }, null, 2));
