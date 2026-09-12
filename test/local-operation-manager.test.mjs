import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allowedLocalActions,
  buildLocalOperationInvocation
} from '../lib/local-operation-manager.mjs';

const registry = {
  byKey: {
    dandao: { key: 'dandao' },
    daolife: { key: 'daolife' }
  }
};

test('control center maps qualification to fixed managed argv without shell text', () => {
  const value = buildLocalOperationInvocation({
    action: 'qualify',
    project: 'dandao',
    force: true,
    projectRegistry: registry
  });
  assert.equal(value.script, 'scripts/qualify-projects.mjs');
  assert.deepEqual(value.args, ['--managed', '--project', 'dandao', '--force']);
});

test('visual enable uses existing visual-control positional protocol', () => {
  const value = buildLocalOperationInvocation({
    action: 'visual_enable',
    project: 'dandao',
    projectRegistry: registry
  });
  assert.equal(value.script, 'scripts/visual-control.mjs');
  assert.deepEqual(value.args, ['enable', 'dandao']);
});

test('unknown projects and project selectors on global actions are rejected', () => {
  assert.throws(
    () => buildLocalOperationInvocation({ action: 'sync', project: 'unknown', projectRegistry: registry }),
    /Unknown or invalid project key/
  );
  assert.throws(
    () => buildLocalOperationInvocation({ action: 'reconcile', project: 'dandao', projectRegistry: registry }),
    /does not accept a project selector/
  );
});

test('browser allowlist intentionally excludes autonomous write and merge authority', () => {
  const actions = allowedLocalActions();
  assert.equal(actions.includes('auto_fix'), false);
  assert.equal(actions.includes('repair_publish'), false);
  assert.equal(actions.includes('create_pr'), false);
  assert.equal(actions.includes('merge'), false);
  assert.equal(actions.includes('visual_run'), true);
  assert.equal(actions.includes('qualify'), true);
});
