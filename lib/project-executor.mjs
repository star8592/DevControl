import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const META_CHARACTERS = /[;&|><`$\n\r]/;
const SECRET_ASSIGNMENT = /\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|COOKIE|AUTHORIZATION|CREDENTIAL)[A-Za-z0-9_]*)(\s*[=:]\s*)(\S+)/gi;

function utcStamp() {
  return new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
}

export function parseSafeCommand(command) {
  const text = String(command || '').trim();
  if (!text) throw new Error('qualification command is empty');
  if (META_CHARACTERS.test(text)) {
    throw new Error(`shell metacharacters are forbidden: ${text}`);
  }

  const tokens = [];
  let current = '';
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === '\\' && quote === '"' && index + 1 < text.length) {
        index += 1;
        current += text[index];
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (quote) throw new Error('unterminated quote in qualification command');
  if (current) tokens.push(current);
  if (!tokens.length) throw new Error('qualification command produced no argv');
  return { executable: tokens[0], args: tokens.slice(1), display: text };
}

export function redactLog(text, env = process.env) {
  let output = String(text || '');
  const secretValues = Object.entries(env)
    .filter(([name, value]) =>
      /KEY|TOKEN|SECRET|PASSWORD|PASSWD|COOKIE|AUTHORIZATION|CREDENTIAL/i.test(name) &&
      typeof value === 'string' &&
      value.length >= 4
    )
    .map(([, value]) => value)
    .sort((a, b) => b.length - a.length);

  for (const value of secretValues) output = output.split(value).join('***REDACTED***');
  return output.replace(
    SECRET_ASSIGNMENT,
    (_match, name, separator) => `${name}${separator}***REDACTED***`
  );
}

async function runCommand({ cwd, command, timeoutMs, env = process.env }) {
  const parsed = parseSafeCommand(command);
  const startedAt = new Date();
  const started = Date.now();

  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let spawnError = null;
    const child = spawn(parsed.executable, parsed.args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', error => { spawnError = error; });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref?.();
    }, timeoutMs);
    timer.unref?.();

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const finishedAt = new Date();
      resolve({
        command: parsed.display,
        executable: parsed.executable,
        args: parsed.args,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Date.now() - started,
        exitCode: Number.isInteger(code) ? code : null,
        signal: signal || null,
        timedOut,
        error: spawnError ? String(spawnError.message || spawnError) : null,
        stdout: redactLog(stdout, env),
        stderr: redactLog(stderr, env),
        passed: code === 0 && !timedOut && !spawnError
      });
    });
  });
}

function summarizeStep(step) {
  return {
    command: step.command,
    passed: step.passed,
    exitCode: step.exitCode,
    signal: step.signal,
    timedOut: step.timedOut,
    error: step.error,
    durationMs: step.durationMs,
    startedAt: step.startedAt,
    finishedAt: step.finishedAt
  };
}

async function writeStepLog(runDir, index, step) {
  const prefix = String(index + 1).padStart(2, '0');
  const name = `${prefix}-${path.basename(step.executable).replace(/[^a-z0-9_.-]/gi, '_')}.log`;
  const content = [
    `$ ${step.command}`,
    '',
    '--- stdout ---',
    step.stdout,
    '',
    '--- stderr ---',
    step.stderr,
    ''
  ].join('\n');
  await writeFile(path.join(runDir, name), content, 'utf8');
  return name;
}

export async function executeProjectQualification({
  project,
  commands,
  stateDir,
  timeoutMs = 15 * 60 * 1000
}) {
  if (!project?.localPath) throw new Error('project.localPath is required');
  if (!Array.isArray(commands) || !commands.length) {
    throw new Error('at least one qualification command is required');
  }

  const projectKey = String(project.key || path.basename(project.localPath));
  const runId = `${utcStamp()}-${randomUUID().slice(0, 8)}`;
  const runDir = path.resolve(stateDir, 'executions', projectKey, runId);
  await mkdir(runDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const steps = [];
  for (const command of commands) {
    const step = await runCommand({
      cwd: project.localPath,
      command,
      timeoutMs
    });
    step.logFile = await writeStepLog(runDir, steps.length, step);
    steps.push(step);
    if (!step.passed) break;
  }

  const passed = steps.length === commands.length && steps.every(step => step.passed);
  const result = {
    schemaVersion: 1,
    runId,
    project: {
      key: projectKey,
      name: project.name || projectKey,
      repo: project.repo || null,
      localPath: project.localPath,
      sha: project.sha || null,
      branch: project.branch || null,
      stacks: project.stacks || []
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    status: passed ? 'PASS' : 'FAIL',
    commands,
    steps: steps.map(summarizeStep),
    failedCommand: steps.find(step => !step.passed)?.command || null,
    runDir
  };

  await writeFile(
    path.join(runDir, 'result.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8'
  );
  await mkdir(path.resolve(stateDir, 'latest'), { recursive: true });
  await writeFile(
    path.resolve(stateDir, 'latest', `${projectKey}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8'
  );

  const event = JSON.stringify({
    at: result.finishedAt,
    project: projectKey,
    runId,
    status: result.status,
    sha: result.project.sha,
    failedCommand: result.failedCommand
  });
  await appendFile(path.resolve(stateDir, 'events.ndjson'), `${event}\n`, 'utf8');
  return result;
}

export async function readLatestExecution(stateDir, projectKey) {
  try {
    return JSON.parse(
      await readFile(path.resolve(stateDir, 'latest', `${projectKey}.json`), 'utf8')
    );
  } catch {
    return null;
  }
}
