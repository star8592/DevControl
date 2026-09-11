import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const CLASSIFIERS = [
  ['timeout', /\b(timeout|timed out|deadline exceeded|SIGKILL)\b/i],
  ['missing_dependency', /\b(module not found|cannot find module|command not found|No module named|not installed)\b/i],
  ['syntax_or_parse', /\b(SyntaxError|parse error|unexpected token|failed to parse|Parser Error)\b/i],
  ['test_failure', /\b(FAILED|test failed|assertion|AssertionError|failures?:)\b/i],
  ['build_failure', /\b(compilation failed|could not compile|build failed|linker|undefined reference)\b/i],
  ['godot_runtime', /\b(Godot|GDScript|Invalid get index|Parse Error|Vulkan|Forward\+)\b/i],
  ['gpu_runtime', /\b(CUDA|cuDNN|NVIDIA|GPU|Vulkan|device lost|out of memory)\b/i],
  ['visual_qualification', /\b(visual|screenshot|frame capture|resolution|renderer|Vulkan|Forward\+)\b/i],
  ['network', /\b(could not resolve host|connection refused|network is unreachable|TLS|certificate)\b/i],
  ['permission', /\b(permission denied|EACCES|unauthorized|forbidden|HTTP 401|HTTP 403)\b/i]
];

function tail(text, maxChars = 12000) {
  const value = String(text || '');
  return value.length <= maxChars ? value : value.slice(-maxChars);
}

export function classifyFailure(text, result = {}) {
  const combined = String(text || '');
  const matches = CLASSIFIERS
    .filter(([, pattern]) => pattern.test(combined))
    .map(([kind]) => kind);
  if (result.steps?.some(step => step.timedOut) && !matches.includes('timeout')) {
    matches.unshift('timeout');
  }
  if (result.failurePhase === 'VISUAL' && !matches.includes('visual_qualification')) {
    matches.unshift('visual_qualification');
  }
  return matches.length ? [...new Set(matches)] : ['unknown'];
}

async function readFailureLog(result) {
  if (result.failurePhase === 'VISUAL' && result.visualQualification?.outputDir) {
    try {
      return await readFile(
        path.resolve(result.visualQualification.outputDir, 'capture.log'),
        'utf8'
      );
    } catch {
      return (result.visualQualification.failureReasons || []).join('\n');
    }
  }
  const failed = result.steps?.find(step => !step.passed);
  if (!failed?.logFile || !result.runDir) return '';
  try {
    return await readFile(path.join(result.runDir, failed.logFile), 'utf8');
  } catch {
    return '';
  }
}

function packetSignature(packet) {
  const payload = [
    packet.project.repo || packet.project.key,
    packet.project.sha || 'no-sha',
    packet.failure.failedCommand || 'unknown-command',
    packet.failure.categories.join(','),
    packet.failure.exitCode ?? 'no-exit'
  ].join('\0');
  return createHash('sha256').update(payload).digest('hex').slice(0, 20);
}

function visualFailureSummary(result) {
  const visual = result.visualQualification;
  if (!visual || result.failurePhase !== 'VISUAL') return null;
  return {
    adapter: visual.adapter || null,
    status: visual.status || null,
    command: visual.command || null,
    outputDir: visual.outputDir || null,
    requested: visual.requested || null,
    gates: visual.gates || null,
    failureReasons: visual.failureReasons || [],
    screenshots: (visual.evidence?.screenshots || []).map(item => ({
      file: item.file || null,
      width: item.width ?? null,
      height: item.height ?? null,
      bytes: item.bytes ?? null
    }))
  };
}

export async function buildFailurePacket({
  stateDir,
  result,
  playbook = null
}) {
  if (result.status !== 'FAIL') throw new Error('AI failure packets require a FAIL result');
  const log = await readFailureLog(result);
  const failed = result.steps?.find(step => !step.passed) || null;
  const visual = visualFailureSummary(result);
  const packet = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    project: result.project,
    runId: result.runId,
    failure: {
      failedCommand: result.failedCommand,
      phase: result.failurePhase || 'COMMAND',
      exitCode: visual ? result.visualQualification?.execution?.exitCode ?? null : failed?.exitCode ?? null,
      signal: visual ? result.visualQualification?.execution?.signal ?? null : failed?.signal ?? null,
      timedOut: visual ? Boolean(result.visualQualification?.execution?.timedOut) : Boolean(failed?.timedOut),
      error: visual ? result.visualQualification?.execution?.error || null : failed?.error || null,
      categories: classifyFailure(`${log}\n${(visual?.failureReasons || []).join('\n')}`, result),
      logExcerpt: tail(log),
      visual
    },
    history: playbook ? {
      observations: playbook.observations,
      runPassRate: playbook.runPassRate,
      lastStatus: playbook.lastStatus,
      preferredQualification: playbook.preferredQualification,
      commandStats: playbook.commands?.[result.failedCommand] || null
    } : null,
    reproduce: {
      cwd: visual?.outputDir || result.project.localPath,
      command: visual?.command || result.failedCommand
    },
    guidance: [
      'Inspect the failure excerpt and structured visual evidence before editing code.',
      'Preserve project safety constraints and do not run deploy/publish/release actions.',
      'Fix the smallest root cause first, then push a new commit and let DevControl re-qualify.',
      visual ? 'For visual failures, preserve the configured renderer/GPU/resolution acceptance gates.' : null
    ].filter(Boolean)
  };
  packet.signature = packetSignature(packet);

  const queueDir = path.resolve(stateDir, 'ai-queue');
  await mkdir(queueDir, { recursive: true });
  const filePath = path.join(
    queueDir,
    `${result.project.key}-${result.runId}-${packet.signature}.json`
  );
  await writeFile(filePath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  return { packet, filePath };
}

export function failureIssueBody(packet) {
  const history = packet.history
    ? `Run pass rate: ${packet.history.runPassRate}\nObservations: ${packet.history.observations}`
    : 'No project history yet.';
  const visual = packet.failure.visual;
  const visualSection = visual ? [
    '',
    '### Visual gate',
    '',
    `Adapter: \`${visual.adapter || '-'}\``,
    `Gates: \`${JSON.stringify(visual.gates || {})}\``,
    `Reasons: ${(visual.failureReasons || []).join(' | ') || '-'}`,
    `Screenshots: ${(visual.screenshots || []).map(x => `${x.file} ${x.width}x${x.height}`).join(', ') || '-'}`
  ] : [];
  return [
    '## DevControl AI Failure Packet',
    '',
    `Project: \`${packet.project.key}\``,
    `Repository: \`${packet.project.repo || '-'}\``,
    `SHA: \`${packet.project.sha || '-'}\``,
    `Run: \`${packet.runId}\``,
    `Signature: \`${packet.signature}\``,
    `Gate: \`${packet.failure.failedCommand || '-'}\``,
    `Phase: \`${packet.failure.phase || 'COMMAND'}\``,
    `Categories: ${packet.failure.categories.join(', ')}`,
    ...visualSection,
    '',
    '### History',
    '',
    history,
    '',
    '### Failure excerpt',
    '',
    '```text',
    packet.failure.logExcerpt.slice(-10000),
    '```',
    '',
    '### Reproduce',
    '',
    '```text',
    `cd ${packet.reproduce.cwd}`,
    packet.reproduce.command || '',
    '```',
    '',
    '> Generated by DevControl. Secrets in executor logs are redacted before this packet is built.'
  ].join('\n');
}
