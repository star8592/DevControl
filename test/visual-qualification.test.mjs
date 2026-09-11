import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  executeVisualQualification,
  probeVisualQualification,
  visualQualificationConfig
} from '../lib/visual-qualification.mjs';

async function fakeGodot(root) {
  const file = path.join(root, 'fake-godot.mjs');
  const source = `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('4.7.2.stable.official');
  process.exit(0);
}
const movieIndex = args.indexOf('--write-movie');
if (movieIndex < 0) process.exit(2);
const movie = args[movieIndex + 1];
const out = movie.replace(/\\.png$/i, '00000000.png');
const buffer = Buffer.alloc(5000);
Buffer.from([137,80,78,71,13,10,26,10]).copy(buffer, 0);
buffer.write('IHDR', 12, 'ascii');
buffer.writeUInt32BE(1920, 16);
buffer.writeUInt32BE(1080, 20);
fs.writeFileSync(out, buffer);
console.log('Godot Engine 4.7.2 - Forward+ - Vulkan - NVIDIA GeForce RTX Test GPU');
process.exit(0);
`;
  await writeFile(file, source, 'utf8');
  await chmod(file, 0o755);
  return file;
}

function projectFixture(root, godotBinary, overrides = {}) {
  return {
    key: 'demo',
    name: 'Demo',
    localPath: root,
    sha: 'abc',
    branch: 'main',
    stacks: ['godot'],
    godotProjectPaths: ['.'],
    registration: {
      state: 'REGISTERED',
      configuredKey: 'demo',
      visualQualification: {
        enabled: true,
        adapter: 'godot-vulkan-frame-capture',
        godotBinary,
        projectPath: '.',
        frames: 3,
        minFrames: 1,
        minWidth: 1920,
        minHeight: 1080,
        minBytes: 100,
        gpuPattern: 'NVIDIA',
        ...overrides
      }
    }
  };
}

test('probe reports READY without starting the project when visual policy is enabled', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'devcontrol-visual-probe-'));
  const binary = await fakeGodot(root);
  await writeFile(path.join(root, 'project.godot'), '[application]\n', 'utf8');
  const result = await probeVisualQualification(projectFixture(root, binary));
  assert.equal(result.state, 'READY');
  assert.equal(result.enabled, true);
  assert.match(result.godotVersion, /4\.7\.2/);
});

test('Godot Vulkan adapter captures PNG evidence and passes configured gates', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'devcontrol-visual-pass-'));
  const stateDir = path.join(root, 'state');
  const projectDir = path.join(root, 'game');
  await mkdir(projectDir, { recursive: true });
  const binary = await fakeGodot(root);
  await writeFile(path.join(projectDir, 'project.godot'), '[application]\n', 'utf8');
  const project = projectFixture(projectDir, binary);

  const result = await executeVisualQualification({
    project,
    stateDir,
    runId: 'run-pass',
    timeoutMs: 10000
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.gates.process, true);
  assert.equal(result.gates.vulkan, true);
  assert.equal(result.gates.gpu, true);
  assert.equal(result.evidence.screenshots.length, 1);
  assert.equal(result.evidence.screenshots[0].width, 1920);
  assert.equal(result.evidence.screenshots[0].height, 1080);
});

test('visual gate fails when captured evidence misses required resolution', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'devcontrol-visual-fail-'));
  const stateDir = path.join(root, 'state');
  const projectDir = path.join(root, 'game');
  await mkdir(projectDir, { recursive: true });
  const binary = await fakeGodot(root);
  await writeFile(path.join(projectDir, 'project.godot'), '[application]\n', 'utf8');
  const project = projectFixture(projectDir, binary, { minWidth: 2560, minHeight: 1440 });

  const result = await executeVisualQualification({
    project,
    stateDir,
    runId: 'run-fail',
    timeoutMs: 10000
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.gates.resolution, false);
  assert.match(result.failureReasons.join('\n'), /2560x1440/);
});

test('visual policy remains opt-in', () => {
  const project = {
    key: 'demo',
    localPath: '/tmp/demo',
    stacks: ['godot'],
    registration: { state: 'REGISTERED', configuredKey: 'demo' }
  };
  assert.equal(visualQualificationConfig(project), null);
});
