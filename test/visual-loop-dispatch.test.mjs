import test from 'node:test';
import assert from 'node:assert/strict';

import {
  visualLoopDispatchSpec,
  visualLoopDispatchEndpoint,
  rejectVisualLoopOverrides,
} from '../lib/visual-loop/dispatch.mjs';

test('visualLoopDispatchSpec accepts only registry-pinned workflow and ref', () => {
  const spec = visualLoopDispatchSpec({
    visualLoop: {
      enabled: true,
      workflow: 'visual-loop-production.yml',
      ref: 'feat/visual-loop-capture',
    },
  });
  assert.deepEqual(spec, {
    workflow: 'visual-loop-production.yml',
    ref: 'feat/visual-loop-capture',
  });
});

test('visualLoopDispatchSpec rejects disabled or unsafe configuration', () => {
  assert.throws(() => visualLoopDispatchSpec({ visualLoop: { enabled: false } }), /explicitly enabled/);
  assert.throws(() => visualLoopDispatchSpec({
    visualLoop: { enabled: true, workflow: '../unsafe.yml', ref: 'main' },
  }), /workflow/);
  assert.throws(() => visualLoopDispatchSpec({
    visualLoop: { enabled: true, workflow: 'visual-loop.yml', ref: '../main' },
  }), /ref/);
});

test('visualLoopDispatchEndpoint is deterministic', () => {
  assert.equal(
    visualLoopDispatchEndpoint('star8592/DaoLife', 'visual-loop-production.yml'),
    '/repos/star8592/DaoLife/actions/workflows/visual-loop-production.yml/dispatches',
  );
});

test('rejectVisualLoopOverrides blocks request-controlled workflow/ref/shell data', () => {
  assert.doesNotThrow(() => rejectVisualLoopOverrides({ project: 'daolife', action: 'visual_loop_qualify' }));
  assert.throws(() => rejectVisualLoopOverrides({ project: 'daolife', action: 'visual_loop_qualify', ref: 'main' }), /overrides are forbidden/);
  assert.throws(() => rejectVisualLoopOverrides({ project: 'daolife', action: 'visual_loop_qualify', command: 'bash anything' }), /overrides are forbidden/);
});
