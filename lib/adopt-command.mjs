import { AdapterRegistry } from './adapter-registry.mjs';
import { RegistryStore } from './registry-store.mjs';

export async function adoptProject(project) {
  const registry = new AdapterRegistry();
  const store = new RegistryStore();

  const profile = registry.detect(project);
  return store.register({
    ...profile,
    source: project
  });
}
