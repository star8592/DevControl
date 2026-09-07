import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REQUIRED_ARRAYS = ['lightWorkflows', 'localWorkflows'];

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
  return project;
}

export async function loadProjectRegistry(baseDir, env = process.env) {
  const configured = env.DEVCONTROL_PROJECTS_FILE || 'config/projects.json';
  const filePath = path.isAbsolute(configured) ? configured : path.resolve(baseDir, configured);
  const raw = JSON.parse(await readFile(filePath, 'utf8'));
  if (!Array.isArray(raw.projects) || raw.projects.length === 0) {
    throw new Error('Project registry must contain a non-empty projects array');
  }

  const seen = new Set();
  const projects = raw.projects.map((value, index) => {
    const project = validateProject({ ...value }, index);
    if (seen.has(project.key)) throw new Error(`Duplicate project key: ${project.key}`);
    seen.add(project.key);
    return project;
  });

  return {
    filePath,
    projects,
    byKey: Object.fromEntries(projects.map(project => [project.key, project]))
  };
}
