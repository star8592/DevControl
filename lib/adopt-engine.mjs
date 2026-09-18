import { detectAdapter } from './adapter-registry.mjs';

export function buildProjectProfile(project) {
  const adapter = detectAdapter(project);

  return {
    name: project.name,
    path: project.path,
    adapter: adapter.id,
    commands: adapter.commands,
    confidence: adapter.id === 'generic' ? 0.2 : 0.9,
    status: 'detected'
  };
}

export function adoptProject(project) {
  return {
    profile: buildProjectProfile(project),
    managed: true,
    adoptedAt: new Date().toISOString()
  };
}
