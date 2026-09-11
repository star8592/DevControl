import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const KNOWN = new Set([
  'timeout',
  'missing_dependency',
  'syntax_or_parse',
  'test_failure',
  'build_failure',
  'godot_runtime',
  'gpu_runtime',
  'network',
  'permission'
]);

const STRATEGIES = {
  timeout: [
    'Reproduce the exact failing command with the same timeout boundary.',
    'Identify whether the process is waiting on I/O, a child process, network, GPU, or deadlock.',
    'Prefer fixing the blocking cause before increasing timeouts.'
  ],
  missing_dependency: [
    'Inspect the project manifest and lockfile before changing dependency versions.',
    'Verify the missing executable/module belongs to the project toolchain.',
    'Use the smallest dependency/environment correction and rerun the failed gate.'
  ],
  syntax_or_parse: [
    'Use the parser location from the failure log to inspect the smallest affected file.',
    'Fix the syntax/parse error without unrelated refactors.',
    'Run the narrow parser/check command before the full qualification sequence.'
  ],
  test_failure: [
    'Reproduce the failing test or assertion before editing implementation code.',
    'Trace the assertion to the smallest behavior regression.',
    'Add or preserve a regression test, then rerun the narrow test and full qualification.'
  ],
  build_failure: [
    'Locate the first compiler/linker error rather than later cascade errors.',
    'Change the smallest compile-time cause and avoid unrelated dependency upgrades.',
    'Rerun the narrow build/check before full qualification.'
  ],
  godot_runtime: [
    'Inspect the first Godot/GDScript/Vulkan error and the referenced scene/resource path.',
    'Validate with the project-pinned Godot version and the intended renderer.',
    'Treat headless smoke as insufficient when the project playbook requires real visual/runtime acceptance.'
  ],
  gpu_runtime: [
    'Confirm the expected GPU, driver, renderer, and memory pressure from the failure evidence.',
    'Separate code regressions from environment/driver/device-loss failures.',
    'Rerun the narrow GPU/runtime gate before expensive full qualification.'
  ],
  network: [
    'Confirm whether the failure is transient DNS/TLS/connectivity or a deterministic endpoint/config issue.',
    'Do not modify application logic to hide infrastructure/network failures.',
    'Retry only bounded, idempotent network checks.'
  ],
  permission: [
    'Identify the exact file, API, credential scope, or executable permission that was denied.',
    'Do not broaden permissions globally; fix the narrow required access boundary.',
    'Never print or copy secret values into repair output.'
  ],
  unknown: [
    'Reproduce the exact failed command and inspect the earliest actionable error.',
    'Separate environment failure from source-code failure before editing.',
    'Apply the smallest change and require the same qualification gate to pass.'
  ]
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function heuristicPlan(packet) {
  const categories = packet.failure?.categories || ['unknown'];
  const steps = unique(
    categories.flatMap(category => STRATEGIES[category] || STRATEGIES.unknown)
  );
  const known = categories.filter(category => KNOWN.has(category)).length;
  const confidence = categories.length
    ? Math.min(0.9, 0.55 + (known / categories.length) * 0.3)
    : 0.45;
  return {
    provider: 'heuristic',
    confidence: Number(confidence.toFixed(2)),
    summary: `Triage ${categories.join(', ')} failure at ${packet.failure?.failedCommand || 'unknown command'}.`,
    steps,
    acceptance: [
      `Reproduce and pass: ${packet.failure?.failedCommand || 'the failed qualification command'}`,
      'Run the remaining DevControl qualification commands.',
      'Only a full PASS may replace known-good.'
    ]
  };
}

function codexPrompt(packet, heuristic) {
  return [
    'You are DevControl Repair Supervisor in PLAN_ONLY mode.',
    'You may inspect the repository, but you MUST NOT modify files, create commits, push, merge, deploy, publish, release, or change external state.',
    'Produce a concise repair plan grounded in the actual repository and the supplied redacted failure packet.',
    'Identify the most likely root cause, the smallest files/areas to inspect, the smallest safe repair, and exact acceptance checks.',
    'Clearly separate evidence from hypotheses.',
    '',
    `Project: ${packet.project?.key} (${packet.project?.repo || 'no repo'})`,
    `SHA: ${packet.project?.sha || '-'}`,
    `Failed command: ${packet.failure?.failedCommand || '-'}`,
    `Categories: ${(packet.failure?.categories || []).join(', ')}`,
    `Historical run pass rate: ${packet.history?.runPassRate ?? 'unknown'}`,
    '',
    'Deterministic triage baseline:',
    ...heuristic.steps.map(step => `- ${step}`),
    '',
    'Redacted failure excerpt:',
    packet.failure?.logExcerpt || '(none)'
  ].join('\n').slice(0, 28000);
}

function runCodexReadOnly(packet, heuristic, timeoutMs = 180000) {
  return new Promise(resolve => {
    const cwd = packet.project?.localPath;
    if (!cwd) {
      resolve({ ok: false, error: 'project localPath is unavailable' });
      return;
    }
    const prompt = codexPrompt(packet, heuristic);
    const child = spawn(
      'codex',
      ['exec', '--ephemeral', '--sandbox', 'read-only', prompt],
      {
        cwd,
        env: process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    let stdout = '';
    let stderr = '';
    let spawnError = null;
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', error => { spawnError = error; });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref?.();
    }, timeoutMs);
    timer.unref?.();
    child.on('close', code => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !spawnError,
        stdout: stdout.slice(-32000),
        stderr: stderr.slice(-8000),
        error: spawnError ? String(spawnError.message || spawnError) : null
      });
    });
  });
}

export async function buildRepairPlan({
  packet,
  provider = 'heuristic',
  timeoutMs = 180000
}) {
  const heuristic = heuristicPlan(packet);
  const plan = {
    schemaVersion: 1,
    signature: packet.signature,
    project: packet.project,
    runId: packet.runId,
    generatedAt: new Date().toISOString(),
    mode: 'PLAN_ONLY',
    provider: 'heuristic',
    confidence: heuristic.confidence,
    summary: heuristic.summary,
    steps: heuristic.steps,
    acceptance: heuristic.acceptance,
    aiAnalysis: null,
    plannerError: null
  };

  if (provider === 'codex') {
    const codex = await runCodexReadOnly(packet, heuristic, timeoutMs);
    plan.provider = 'codex-read-only';
    if (codex.ok && codex.stdout.trim()) {
      plan.aiAnalysis = codex.stdout.trim();
      plan.confidence = Math.min(0.95, Number((heuristic.confidence + 0.05).toFixed(2)));
    } else {
      plan.plannerError = codex.error || codex.stderr || 'Codex planner failed';
    }
  }
  return plan;
}

export async function saveRepairPlan(stateDir, plan) {
  const dir = path.resolve(stateDir, 'repair-plans');
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${plan.signature}.json`);
  await writeFile(filePath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function loadRepairPlan(stateDir, signature) {
  try {
    return JSON.parse(
      await readFile(path.resolve(stateDir, 'repair-plans', `${signature}.json`), 'utf8')
    );
  } catch {
    return null;
  }
}

export { heuristicPlan };
