#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { attachAutonomyPlans } from '../lib/autonomy-policy.mjs';
import { discoverProjects, writeDiscoveryReport } from '../lib/project-discovery.mjs';
import { loadProjectRegistry } from '../lib/project-registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const registry = await loadProjectRegistry(baseDir);
const rootsRaw =
  argValue('--roots') ||
  process.env.DEVCONTROL_DISCOVERY_ROOTS ||
  '/mnt/disk1/Code:/mnt/disk2';
const roots = rootsRaw.split(':').map(value => value.trim()).filter(Boolean);
const maxDepth = Number(
  argValue('--max-depth') || process.env.DEVCONTROL_DISCOVERY_MAX_DEPTH || 3
);
const output =
  argValue('--output') || process.env.DEVCONTROL_DISCOVERY_FILE || 'state/discovery.json';

const rawReport = await discoverProjects({
  roots,
  maxDepth,
  configuredProjects: registry.projects
});
const report = attachAutonomyPlans(rawReport);
const target = await writeDiscoveryReport(baseDir, report, output);

console.log(JSON.stringify({
  report: target,
  roots: report.roots,
  counts: report.counts,
  newProjects: report.projects
    .filter(project => project.registration.state === 'NEW')
    .map(project => ({
      key: project.key,
      localPath: project.localPath,
      repo: project.repo,
      stacks: project.stacks,
      confidence: project.confidence,
      autonomy: project.autonomy.level,
      safeCommands: project.autonomy.safeCommands
    })),
  conflicts: report.projects
    .filter(project => project.registration.state === 'CONFLICT')
    .map(project => ({
      key: project.key,
      localPath: project.localPath,
      conflicts: project.registration.conflicts
    }))
}, null, 2));
