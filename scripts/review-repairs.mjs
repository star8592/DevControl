#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyRepairReview, repairReviewSummary } from '../lib/repair-review.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');
const stateDir = path.resolve(baseDir, process.env.DEVCONTROL_STATE_DIR || 'state');
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

async function githubJson(url) {
  if (!token) throw new Error('GITHUB_TOKEN is required to inspect repair pull requests');
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'DevControl/0.10'
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const detail = data?.message || text || `HTTP ${response.status}`;
    throw new Error(`GitHub ${response.status}: ${String(detail).slice(0, 600)}`);
  }
  return data;
}

let names = [];
const candidatesDir = path.resolve(stateDir, 'repair-candidates');
try { names = await readdir(candidatesDir); } catch {}
const reviewsDir = path.resolve(stateDir, 'repair-reviews');
await mkdir(reviewsDir, { recursive: true });

const results = [];
for (const name of names.filter(value => value.endsWith('.json')).sort()) {
  const candidate = await readJson(path.join(candidatesDir, name));
  if (!candidate?.project || !candidate?.repo || !candidate?.signature) continue;
  if (!candidate.pr?.number) continue;
  if (selected && candidate.project !== selected) continue;

  let record;
  try {
    const pullRequest = await githubJson(
      `https://api.github.com/repos/${candidate.repo}/pulls/${candidate.pr.number}`
    );
    const headSha = pullRequest?.head?.sha;
    let checkRuns = [];
    let statuses = [];
    if (headSha) {
      const [checksData, statusesData] = await Promise.all([
        githubJson(
          `https://api.github.com/repos/${candidate.repo}/commits/${headSha}/check-runs?per_page=100`
        ),
        githubJson(
          `https://api.github.com/repos/${candidate.repo}/commits/${headSha}/statuses?per_page=100`
        )
      ]);
      checkRuns = checksData?.check_runs || [];
      statuses = Array.isArray(statusesData) ? statusesData : [];
    }
    const review = classifyRepairReview({ candidate, pullRequest, checkRuns, statuses });
    record = {
      schemaVersion: 1,
      project: candidate.project,
      repo: candidate.repo,
      signature: candidate.signature,
      candidateStatus: candidate.status,
      pr: {
        number: candidate.pr.number,
        url: pullRequest.html_url || candidate.pr.url || null
      },
      reviewedAt: new Date().toISOString(),
      ...repairReviewSummary(review)
    };
  } catch (error) {
    record = {
      schemaVersion: 1,
      project: candidate.project,
      repo: candidate.repo,
      signature: candidate.signature,
      candidateStatus: candidate.status,
      pr: candidate.pr,
      reviewedAt: new Date().toISOString(),
      state: 'ERROR',
      reasons: [String(error.message || error)],
      checks: { total: 0, passed: 0, pending: 0, failed: 0 }
    };
  }

  await writeFile(
    path.resolve(reviewsDir, `${candidate.signature}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8'
  );
  results.push(record);
}

const ok = results.every(item => item.state !== 'ERROR');
console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);
