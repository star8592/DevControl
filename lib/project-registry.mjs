import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { loadProjectOverrides, mergeProjectOverrides } from './project-overrides.mjs';

const REQUIRED_ARRAYS = ['lightWorkflows', 'localWorkflows'];
const VISUAL_ADAPTERS = new Set(['godot-vulkan-frame-capture']);

function positiveInt(value, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null) return;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
}

function validateVisualQualification(value, label) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (typeof value.enabled !== 'boolean') {
    throw new Error(`${label}.enabled must be boolean`);
  }
  const adapter = value.adapter || 'godot-vulkan-frame-capture';
  if (!VISUAL_ADAPTERS.has(adapter)) {
    throw new Error(`${label}.adapter is unsupported: ${adapter}`);
  }
  if (value.projectPath != null) {
    if (typeof value.projectPath !== 'string' || !value.projectPath.trim()) {
      throw new Error(`${label}.projectPath must be a non-empty relative path when set`);
    }
    const normalized = path.normalize(value.projectPath);
    if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
      throw new Error(`${label}.projectPath must stay inside the registered project`);
    }
  }
  if (value.godotBinary != null) {
    if (typeof value.godotBinary !== 'string' || !value.godotBinary.trim()) {
      throw new Error(`${label}.godotBinary must be a non-empty string when set`);
    }
    const base = path.basename(value.godotBinary);
    if (!/^godot(?:[0-9._-]+)?$/i.test(base)) {
      throw new Error(`${label}.godotBinary must resolve to a Godot-named executable`);
    }
  }
  if (value.renderer != null && value.renderer !== 'forward_plus') {
    throw new Error(`${label}.renderer currently supports forward_plus only`);
  }
  positiveInt(value.gpuIndex, `${label}.gpuIndex`, { min: 0, max: 15 });
  positiveInt(value.frames, `${label}.frames`, { min: 1, max: 1800 });
  positiveInt(value.fps, `${label}.fps`, { min: 1, max: 240 });
  positiveInt(value.minFrames, `${label}.minFrames`, { min: 1, max: 1800 });
  positiveInt(value.minWidth, `${label}.minWidth`, { min: 1, max: 16384 });
  positiveInt(value.minHeight, `${label}.minHeight`, { min: 1, max: 16384 });
  positiveInt(value.minBytes, `${label}.minBytes`, { min: 1, max: 1024 * 1024 * 1024 });
  if (value.headless != null && typeof value.headless !== 'boolean') {
    throw new Error(`${label}.headless must be boolean when set`);
  }
  if (value.requireVulkan != null && typeof value.requireVulkan !== 'boolean') {
    throw new Error(`${label}.requireVulkan must be boolean when set`);
  }
  if (value.gpuPattern != null && typeof value.gpuPattern !== 'string') {
    throw new Error(`${label}.gpuPattern must be a string when set`);
  }
  return { ...value, adapter };
}

function validateProject(project, index) {
  const label = `projects[${index}]`;
  for (const key of ['key', 'name', 'repo']) {
    if (typeof project?.[key] !== 'string' || !project[key].trim()) {
      throw new Error(`${label}.${key} must be a non-empty string`);
    }
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(project.key)) {
    throw new Error(`${label}.key contains unsupported characters`);
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(project.repo)) {
    throw new Error(`${label}.repo must use owner/name form`);
  }
  if (project.dashboardIssue != null && (!Number.isInteger(project.dashboardIssue) || project.dashboardIssue <= 0)) {
    throw new Error(`${label}.dashboardIssue must be a positive integer when set`);
  }
  for (const key of REQUIRED_ARRAYS) {
    if (project[key] == null) project[key] = [];
    if (!Array.isArray(project[key]) || project[key].some(value => typeof value !== 'string')) {
      throw new Error(`${label}.${key} must be an array of strings`);
    }
  }
  if (project.tags == null) project.tags = [];
  if (!Array.isArray(project.tags) || project.tags.some(value => typeof value !== 'string')) {
    throw new Error(`${label}.tags must be an array of strings`);
  }
  project.visualQualification = validateVisualQualification(
    project.visualQualification,
    `${label}.visualQualification`
  );
  return project;
}

export async function loadProjectRegistry(baseDir, env = process.env) {
  const configured = env.DEVCONTROL_PROJECTS_FILE || 'config/projects.json';
  const filePath = path.isAbsolute(configured) ? configured : path.resolve(baseDir, configured);
  const raw = JSON.parse(await readFile(filePath, 'utf8'));
  if (!Array.isArray(raw.projects) || raw.projects.length === 0) {
    throw new Error('Project registry must contain a non-empty projects array');
  }

  const baseProjects = raw.projects.map(value => ({ ...value }));
  const overrides = await loadProjectOverrides(baseDir, env);
  mergeProjectOverrides(baseProjects, overrides);

  const seen = new Set();
  const projects = baseProjects.map((value, index) => {
    const project = validateProject({ ...value }, index);
    if (seen.has(project.key)) throw new Error(`Duplicate project key: ${project.key}`);
    seen.add(project.key);
    return project;
  });

  return {
    filePath,
    overridesFile: overrides.filePath,
    projects,
    byKey: Object.fromEntries(projects.map(project => [project.key, project]))
  };
}
