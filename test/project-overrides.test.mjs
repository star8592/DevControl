import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadProjectRegistry } from '../lib/project-registry.mjs';
import {
  loadProjectOverrides,
  updateProjectVisualOverride
} from '../lib/project-overrides.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'devcontrol-overrides-'));
  const registryFile = path.join(root, 'projects.json');
  const overridesFile = path.join(root, 'projects.local.json');
  await writeFile(registryFile, JSON.stringify({
    projects: [{
      key: 'demo',
      name: 'Demo',
      repo: 'star8592/demo',
      lightWorkflows: [],
      localWorkflows: [],
      tags: ['godot'],
      visualQualification: {
        enabled: false,
        adapter: 'godot-vulkan-frame-capture',
        renderer: 'forward_plus',
        gpuIndex: 0,
        minWidth: 1920,
        minHeight: 1080
      }
    }]
  }, null, 2));
  const env = {
    ...process.env,
    DEVCONTROL_PROJECTS_FILE: registryFile,
    DEVCONTROL_PROJECT_OVERRIDES_FILE: overridesFile
  };
  return { root, registryFile, overridesFile, env };
}

test('machine-local visual override merges over repository defaults', async () => {
  const { root, env, overridesFile } = await fixture();
  await updateProjectVisualOverride({
    baseDir: root,
    projectKey: 'demo',
    visualQualification: {
      enabled: true,
      projectPath: 'game',
      gpuIndex: 2,
      gpuPattern: 'RTX 5070 Ti'
    },
    env
  });

  const registry = await loadProjectRegistry(root, env);
  const visual = registry.byKey.demo.visualQualification;
  assert.equal(registry.overridesFile, overridesFile);
  assert.equal(visual.enabled, true);
  assert.equal(visual.renderer, 'forward_plus');
  assert.equal(visual.minWidth, 1920);
  assert.equal(visual.projectPath, 'game');
  assert.equal(visual.gpuIndex, 2);
  assert.equal(visual.gpuPattern, 'RTX 5070 Ti');
});

test('local overrides reject unsupported top-level project fields', async () => {
  const { root, env, overridesFile } = await fixture();
  await writeFile(overridesFile, JSON.stringify({
    schemaVersion: 1,
    projects: { demo: { repo: 'attacker/other' } }
  }));
  await assert.rejects(
    () => loadProjectOverrides(root, env),
    /unsupported fields: repo/
  );
});

test('registry rejects overrides for unknown projects', async () => {
  const { root, env, overridesFile } = await fixture();
  await writeFile(overridesFile, JSON.stringify({
    schemaVersion: 1,
    projects: { unknown: { visualQualification: { enabled: true } } }
  }));
  await assert.rejects(
    () => loadProjectRegistry(root, env),
    /unknown registry key: unknown/
  );
});
