import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildJudgePacket } from '../lib/visual-loop/packet.mjs';

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fixture({ roles = ['gameplay_hero', 'character_close'], origin = 'godot-production' } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'visual-loop-packet-'));
  const contractRoot = path.join(root, 'contract');
  const captureRoot = path.join(root, 'repo');
  await mkdir(path.join(contractRoot, 'targets'), { recursive: true });
  await mkdir(path.join(captureRoot, 'captures'), { recursive: true });

  const targets = {};
  const captures = [];
  for (const role of roles) {
    const targetBytes = Buffer.from(`target:${role}`);
    const currentBytes = Buffer.from(`current:${role}`);
    const targetPath = `targets/${role}.png`;
    const currentPath = `captures/${role}.png`;
    await writeFile(path.join(contractRoot, targetPath), targetBytes);
    await writeFile(path.join(captureRoot, currentPath), currentBytes);
    targets[role] = {
      path: targetPath,
      sha256: digest(targetBytes),
      source: 'human-approved',
      note: `${role} target`,
    };
    captures.push({
      role,
      required: true,
      path: currentPath,
      exists: true,
      sha256: digest(currentBytes),
      width: 1920,
      height: 1080,
      resolution_ok: true,
      origin,
      fallback_capture: false,
      editor_preview: false,
      blender_preview: false,
      fast_scaffold: false,
      generated_target_presented_as_production: false,
    });
  }

  const contract = {
    schemaVersion: 1,
    state: 'frozen',
    contractId: 'test-contract-v1',
    project: 'Test',
    frozenAt: '2026-09-11T10:00:00Z',
    requiredRoles: roles,
    targets,
  };
  const manifest = {
    schema_version: 2,
    contract_id: 'test-contract-v1',
    round_id: 'round-1',
    commit_sha: 'abc123',
    runner_identity: 'runner-a',
    engine: 'Godot',
    engine_version: '4.7.2',
    renderer: 'Vulkan Forward+',
    renderer_device: 'NVIDIA GeForce RTX 5070 Ti',
    resolution: [1920, 1080],
    captures,
    evidence_complete: true,
    qualified: false,
    gates: {
      runtime: { state: 'pass' },
      evidence: { state: 'pass' },
      performance: { state: 'inconclusive_external_load' },
      visual: { state: 'pending_independent_judge' },
    },
  };
  return { root, contractRoot, captureRoot, contract, manifest };
}

test('judge packet binds verified target and current capture bytes', async () => {
  const data = await fixture();
  try {
    const packet = await buildJudgePacket({
      contract: data.contract,
      manifest: data.manifest,
      targetRoot: data.contractRoot,
      captureRoot: data.captureRoot,
    });
    assert.equal(packet.kind, 'visual-loop-judge-packet');
    assert.equal(packet.contract.contractId, 'test-contract-v1');
    assert.deepEqual(Object.keys(packet.views), ['gameplay_hero', 'character_close']);
    assert.equal(packet.views.character_close.current.origin, 'godot-production');
    assert.match(packet.instruction, /independent VisualLoop production-art judge/);
    assert.equal(packet.judgePolicy.passScore, 8.5);
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test('judge packet accepts DanDao authored-room origin and project-specific dimensions', async () => {
  const roles = ['gameplay_hero', 'furnace_close', 'fire_control_close', 'alternate_left', 'result_right'];
  const data = await fixture({ roles, origin: 'godot-production-authored-room' });
  const weights = {
    composition: 0.18,
    scale: 0.08,
    furnace: 0.22,
    controls: 0.14,
    materials: 0.16,
    lighting: 0.10,
    detail: 0.08,
    feedback: 0.04,
  };
  try {
    const packet = await buildJudgePacket({
      contract: data.contract,
      manifest: data.manifest,
      targetRoot: data.contractRoot,
      captureRoot: data.captureRoot,
      weights,
    });
    assert.equal(packet.views.furnace_close.current.origin, 'godot-production-authored-room');
    assert.deepEqual(packet.judgePolicy.weights, weights);
    assert.match(packet.instruction, /furnace/);
    assert.match(packet.instruction, /controls/);
    assert.doesNotMatch(packet.instruction, /character=/);
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test('judge packet rejects non-production origin variants', async () => {
  const data = await fixture({ origin: 'blender-production' });
  try {
    await assert.rejects(
      buildJudgePacket({
        contract: data.contract,
        manifest: data.manifest,
        targetRoot: data.contractRoot,
        captureRoot: data.captureRoot,
      }),
      /not an allowed Godot production origin/,
    );
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test('judge packet rejects current capture byte substitution', async () => {
  const data = await fixture();
  try {
    await writeFile(path.join(data.captureRoot, 'captures/character_close.png'), Buffer.from('substituted'));
    await assert.rejects(
      buildJudgePacket({
        contract: data.contract,
        manifest: data.manifest,
        targetRoot: data.contractRoot,
        captureRoot: data.captureRoot,
      }),
      /current capture character_close SHA-256 mismatch/,
    );
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test('judge packet refuses incomplete evidence before vision judging', async () => {
  const data = await fixture();
  try {
    data.manifest.evidence_complete = false;
    await assert.rejects(
      buildJudgePacket({
        contract: data.contract,
        manifest: data.manifest,
        targetRoot: data.contractRoot,
        captureRoot: data.captureRoot,
      }),
      /round evidence must be complete before judging/,
    );
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});
