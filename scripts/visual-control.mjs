#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { attachAutonomyPlans } from '../lib/autonomy-policy.mjs';
import { discoverProjects, writeDiscoveryReport } from '../lib/project-discovery.mjs';
import { loadProjectRegistry } from '../lib/project-registry.mjs';
import {
  removeProjectVisualOverride,
  updateProjectVisualOverride
} from '../lib/project-overrides.mjs';
import {
  executeVisualQualification,
  probeVisualQualification,
  visualQualificationConfig
} from '../lib/visual-qualification.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');
const stateDir = path.resolve(baseDir, process.env.DEVCONTROL_STATE_DIR || 'state');
const action = process.argv[2] || 'status';
const projectKey = process.argv[3] || null;

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function intArg(name, fallback = null) {
  const value = argValue(name);
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} requires an integer`);
  return parsed;
}

async function refreshDiscovery() {
  const registry = await loadProjectRegistry(baseDir);
  const rootsRaw = process.env.DEVCONTROL_DISCOVERY_ROOTS || '/mnt/disk1/Code:/mnt/disk2';
  const roots = rootsRaw.split(':').map(value => value.trim()).filter(Boolean);
  const maxDepth = Number(process.env.DEVCONTROL_DISCOVERY_MAX_DEPTH || 3);
  const raw = await discoverProjects({
    roots,
    maxDepth,
    configuredProjects: registry.projects
  });
  const report = attachAutonomyPlans(raw);
  await writeDiscoveryReport(
    baseDir,
    report,
    process.env.DEVCONTROL_DISCOVERY_FILE || 'state/discovery.json'
  );
  return { registry, report };
}

function findProject(report, key) {
  return (report.projects || []).find(project =>
    project.key === key || project.registration?.configuredKey === key
  ) || null;
}

function requireProject(report, key) {
  const project = findProject(report, key);
  if (!project) throw new Error(`Project is not currently discovered: ${key}`);
  if (!(project.stacks || []).includes('godot')) {
    throw new Error(`Project ${key} has no discovered Godot project root`);
  }
  return project;
}

function inferProjectPath(project, configuredPath = null) {
  const explicit = argValue('--project-path');
  if (explicit) return explicit;
  if (configuredPath) return configuredPath;
  const roots = project.godotProjectPaths || [];
  if (roots.length === 1) return roots[0];
  if (!roots.length) throw new Error(`No project.godot found for ${project.key}`);
  throw new Error(
    `Multiple Godot roots detected for ${project.key}: ${roots.join(', ')}; use --project-path <path>`
  );
}

function print(value, exitCode = 0) {
  console.log(JSON.stringify(value, null, 2));
  process.exit(exitCode);
}

if (!['enable', 'disable', 'reset', 'run', 'status'].includes(action)) {
  throw new Error(`Unsupported visual action: ${action}`);
}
if (!projectKey) {
  throw new Error('Usage: devctl visual-enable|visual-disable|visual-reset|visual-run|visual-status <project>');
}

let { registry, report } = await refreshDiscovery();
let project = requireProject(report, projectKey);
const registeredKey = project.registration?.configuredKey || project.key;
const registryProject = registry.byKey[registeredKey];
if (!registryProject) throw new Error(`Visual controls require a registered project: ${registeredKey}`);

if (action === 'enable') {
  const base = registryProject.visualQualification || {};
  const projectPath = inferProjectPath(project, base.projectPath || null);
  const visualQualification = {
    ...base,
    enabled: true,
    adapter: 'godot-vulkan-frame-capture',
    projectPath,
    renderer: 'forward_plus',
    gpuIndex: intArg('--gpu-index', base.gpuIndex ?? 0),
    frames: intArg('--frames', base.frames ?? 90),
    fps: intArg('--fps', base.fps ?? 30),
    minFrames: intArg('--min-frames', base.minFrames ?? 1),
    minWidth: intArg('--width', base.minWidth ?? 1920),
    minHeight: intArg('--height', base.minHeight ?? 1080),
    minBytes: intArg('--min-bytes', base.minBytes ?? 4096),
    headless: !process.argv.includes('--windowed'),
    requireVulkan: !process.argv.includes('--allow-non-vulkan'),
    gpuPattern: argValue('--gpu-pattern') || base.gpuPattern || 'NVIDIA'
  };
  const godotBinary = argValue('--godot-bin');
  if (godotBinary) visualQualification.godotBinary = godotBinary;

  const updated = await updateProjectVisualOverride({
    baseDir,
    projectKey: registeredKey,
    visualQualification
  });
  ({ registry, report } = await refreshDiscovery());
  project = requireProject(report, registeredKey);
  const probe = await probeVisualQualification(project);
  print({
    ok: probe.state === 'READY',
    action: 'enable',
    project: registeredKey,
    overridesFile: updated.filePath,
    policy: visualQualificationConfig(project),
    probe
  }, probe.state === 'READY' ? 0 : 1);
}

if (action === 'disable') {
  const updated = await updateProjectVisualOverride({
    baseDir,
    projectKey: registeredKey,
    visualQualification: { enabled: false }
  });
  await refreshDiscovery();
  print({
    ok: true,
    action: 'disable',
    project: registeredKey,
    overridesFile: updated.filePath,
    message: 'visual qualification disabled locally; repository defaults were not modified'
  });
}

if (action === 'reset') {
  const removed = await removeProjectVisualOverride({ baseDir, projectKey: registeredKey });
  await refreshDiscovery();
  print({
    ok: true,
    action: 'reset',
    project: registeredKey,
    overridesFile: removed.filePath,
    removed: removed.removed,
    message: 'local visual override removed; repository default policy is active again'
  });
}

if (action === 'status') {
  const probe = await probeVisualQualification(project);
  print({
    ok: probe.state !== 'GODOT_UNAVAILABLE',
    action: 'status',
    project: registeredKey,
    godotProjectPaths: project.godotProjectPaths || [],
    policy: visualQualificationConfig(project),
    probe
  }, probe.state === 'GODOT_UNAVAILABLE' ? 1 : 0);
}

if (action === 'run') {
  const probe = await probeVisualQualification(project);
  if (probe.state !== 'READY') {
    print({
      ok: false,
      action: 'run',
      project: registeredKey,
      probe,
      message: `visual gate is not ready; run devctl visual-enable ${registeredKey} first`
    }, 2);
  }
  const runId = `manual-${new Date().toISOString().replace(/[-:.]/g, '')}-${randomUUID().slice(0, 8)}`;
  const result = await executeVisualQualification({
    project: { ...project, key: registeredKey },
    stateDir,
    runId,
    timeoutMs: Number(process.env.DEVCONTROL_VISUAL_TIMEOUT_MS || 300000)
  });
  print({
    ok: result.status === 'PASS',
    action: 'run',
    project: registeredKey,
    runId,
    status: result.status,
    outputDir: result.outputDir || null,
    gates: result.gates || null,
    evidence: result.evidence || null,
    failureReasons: result.failureReasons || [],
    note: 'manual visual-run does not promote known-good; use normal DevControl qualification for promotion'
  }, result.status === 'PASS' ? 0 : 1);
}
