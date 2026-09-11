#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { probeVisualQualification, visualQualificationConfig } from '../lib/visual-qualification.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');
const discoveryFile = path.resolve(
  baseDir,
  process.env.DEVCONTROL_DISCOVERY_FILE || 'state/discovery.json'
);
const selected = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : null;

let discovery;
try {
  discovery = JSON.parse(await readFile(discoveryFile, 'utf8'));
} catch {
  console.error(`Discovery report not found: ${discoveryFile}`);
  console.error('Run: devctl discover');
  process.exit(2);
}

const results = [];
for (const project of discovery.projects || []) {
  const key = project.registration?.configuredKey || project.key;
  if (selected && key !== selected && project.key !== selected) continue;
  const probe = await probeVisualQualification(project);
  const config = visualQualificationConfig(project);
  results.push({
    project: key,
    repo: project.repo || null,
    localPath: project.localPath,
    stacks: project.stacks || [],
    godotProjectPaths: project.godotProjectPaths || [],
    state: probe.state,
    enabled: probe.enabled,
    adapter: probe.adapter,
    godotBinary: probe.godotBinary || null,
    godotVersion: probe.godotVersion || null,
    reason: probe.reason || null,
    policy: config
  });
}

console.log(JSON.stringify({
  ok: results.every(item => item.state !== 'GODOT_UNAVAILABLE'),
  discoveryFile,
  results
}, null, 2));
