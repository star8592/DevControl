import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { redactLog } from './project-executor.mjs';

const MAX_BUFFER = 64 * 1024;
const PROJECT_KEY = /^[a-z0-9][a-z0-9_-]*$/i;

const ACTIONS = Object.freeze({
  discover: { script: 'scripts/discover-projects.mjs', project: false },
  visual_probe: { script: 'scripts/probe-visual.mjs', project: true },
  visual_enable: { script: 'scripts/visual-control.mjs', project: true, fixedArgs: ['enable'], projectArg: 'positional' },
  visual_disable: { script: 'scripts/visual-control.mjs', project: true, fixedArgs: ['disable'], projectArg: 'positional' },
  visual_status: { script: 'scripts/visual-control.mjs', project: true, fixedArgs: ['status'], projectArg: 'positional' },
  visual_run: { script: 'scripts/visual-control.mjs', project: true, fixedArgs: ['run'], projectArg: 'positional' },
  sync: { script: 'scripts/sync-projects.mjs', project: true, managed: true },
  qualify: { script: 'scripts/qualify-projects.mjs', project: true, managed: true },
  reconcile: { script: 'scripts/reconcile.mjs', project: false },
  failures: { script: 'scripts/report-failures.mjs', project: false },
  repairs: { script: 'scripts/plan-repairs.mjs', project: false },
  repair_review: { script: 'scripts/review-repairs.mjs', project: true },
  repair_cleanup: { script: 'scripts/cleanup-repairs.mjs', project: true }
});

function appendBounded(current, chunk) {
  const next = current + chunk.toString('utf8');
  return next.length <= MAX_BUFFER ? next : next.slice(-MAX_BUFFER);
}

export function allowedLocalActions() {
  return Object.keys(ACTIONS);
}

export function buildLocalOperationInvocation({ action, project = null, force = false }) {
  const spec = ACTIONS[action];
  if (!spec) {
    const error = new Error(`Local action not allowed: ${action}`);
    error.status = 400;
    throw error;
  }
  if (project != null) {
    if (!spec.project) {
      const error = new Error(`Action ${action} does not accept a project selector`);
      error.status = 400;
      throw error;
    }
    if (!PROJECT_KEY.test(String(project))) {
      const error = new Error('Invalid project key');
      error.status = 400;
      throw error;
    }
  }
  if (typeof force !== 'boolean') {
    const error = new Error('force must be boolean');
    error.status = 400;
    throw error;
  }

  const args = [...(spec.fixedArgs || [])];
  if (spec.managed) args.push('--managed');
  if (project) {
    if (spec.projectArg === 'positional') args.push(String(project));
    else args.push('--project', String(project));
  }
  if (force && action === 'qualify') args.push('--force');
  return { script: spec.script, args };
}

export function createLocalOperationManager({ baseDir, onFinish = null }) {
  const operations = new Map();
  let activeId = null;

  function list() {
    return [...operations.values()]
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
      .slice(0, 50);
  }

  function get(id) {
    return operations.get(id) || null;
  }

  function start({ action, project = null, force = false }) {
    const invocation = buildLocalOperationInvocation({ action, project, force });
    if (activeId) {
      const active = operations.get(activeId);
      if (active?.status === 'RUNNING') {
        const error = new Error(`Another local operation is already running: ${active.action}`);
        error.status = 409;
        error.activeOperation = active;
        throw error;
      }
      activeId = null;
    }

    const id = randomUUID();
    const operation = {
      id,
      action,
      project,
      force,
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: '',
      error: null
    };
    operations.set(id, operation);
    activeId = id;

    const child = spawn(
      process.execPath,
      [path.resolve(baseDir, invocation.script), ...invocation.args],
      {
        cwd: baseDir,
        env: process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    child.stdout.on('data', chunk => {
      operation.stdout = redactLog(appendBounded(operation.stdout, chunk));
    });
    child.stderr.on('data', chunk => {
      operation.stderr = redactLog(appendBounded(operation.stderr, chunk));
    });
    child.on('error', error => {
      operation.error = String(error.message || error);
    });
    child.on('close', (code, signal) => {
      operation.exitCode = Number.isInteger(code) ? code : null;
      operation.signal = signal || null;
      operation.finishedAt = new Date().toISOString();
      operation.status = code === 0 && !operation.error ? 'SUCCESS' : 'FAILED';
      if (activeId === id) activeId = null;
      Promise.resolve(onFinish?.({ ...operation })).catch(() => {});
    });

    return { ...operation, stdout: '', stderr: '' };
  }

  return {
    start,
    list,
    get,
    allowedActions: allowedLocalActions
  };
}
