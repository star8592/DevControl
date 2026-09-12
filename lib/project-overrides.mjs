import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function emptyOverrides() {
  return { schemaVersion: 1, projects: {} };
}

export function resolveProjectOverridesFile(baseDir, env = process.env) {
  const configured = env.DEVCONTROL_PROJECT_OVERRIDES_FILE;
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(baseDir, configured);
  }
  return path.resolve(baseDir, 'state', 'projects.local.json');
}

export async function loadProjectOverrides(baseDir, env = process.env) {
  const filePath = resolveProjectOverridesFile(baseDir, env);
  let raw;
  try {
    raw = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return { filePath, ...emptyOverrides() };
    throw new Error(`Failed to read project overrides: ${error.message || error}`);
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Project overrides must be a JSON object');
  }
  if (raw.schemaVersion != null && raw.schemaVersion !== 1) {
    throw new Error(`Unsupported project overrides schemaVersion: ${raw.schemaVersion}`);
  }
  if (!raw.projects || typeof raw.projects !== 'object' || Array.isArray(raw.projects)) {
    throw new Error('Project overrides must contain a projects object');
  }

  const projects = {};
  for (const [key, value] of Object.entries(raw.projects)) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(key)) {
      throw new Error(`Invalid project override key: ${key}`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Project override ${key} must be an object`);
    }
    const unknown = Object.keys(value).filter(name => name !== 'visualQualification');
    if (unknown.length) {
      throw new Error(`Project override ${key} contains unsupported fields: ${unknown.join(', ')}`);
    }
    if (value.visualQualification != null && (
      typeof value.visualQualification !== 'object' ||
      Array.isArray(value.visualQualification)
    )) {
      throw new Error(`Project override ${key}.visualQualification must be an object`);
    }
    projects[key] = value;
  }

  return { filePath, schemaVersion: 1, projects };
}

export function mergeProjectOverrides(projects, overrides) {
  const byKey = new Map(projects.map(project => [project.key, project]));
  for (const [key, override] of Object.entries(overrides?.projects || {})) {
    const project = byKey.get(key);
    if (!project) throw new Error(`Project override references unknown registry key: ${key}`);
    if (override.visualQualification) {
      project.visualQualification = {
        ...(project.visualQualification || {}),
        ...override.visualQualification
      };
    }
  }
  return projects;
}

export async function updateProjectVisualOverride({
  baseDir,
  projectKey,
  visualQualification,
  env = process.env
}) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(String(projectKey || ''))) {
    throw new Error('projectKey contains unsupported characters');
  }
  const current = await loadProjectOverrides(baseDir, env);
  const next = {
    schemaVersion: 1,
    projects: {
      ...current.projects,
      [projectKey]: {
        ...(current.projects[projectKey] || {}),
        visualQualification: {
          ...(current.projects[projectKey]?.visualQualification || {}),
          ...visualQualification
        }
      }
    }
  };
  await mkdir(path.dirname(current.filePath), { recursive: true });
  await writeFile(current.filePath, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
  return { filePath: current.filePath, value: next.projects[projectKey].visualQualification };
}

export async function removeProjectVisualOverride({ baseDir, projectKey, env = process.env }) {
  const current = await loadProjectOverrides(baseDir, env);
  if (!current.projects[projectKey]) return { filePath: current.filePath, removed: false };
  const projects = { ...current.projects };
  delete projects[projectKey];
  await mkdir(path.dirname(current.filePath), { recursive: true });
  await writeFile(
    current.filePath,
    `${JSON.stringify({ schemaVersion: 1, projects }, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
  return { filePath: current.filePath, removed: true };
}
