const WORKFLOW_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.ya?ml$/;
const REF = /^(?!\/)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,200}$/;

function assert(condition, message) {
  if (!condition) throw new Error(`VisualLoop dispatch config error: ${message}`);
}

export function visualLoopDispatchSpec(project) {
  const config = project?.visualLoop;
  assert(config && typeof config === 'object' && !Array.isArray(config), 'visualLoop must be configured');
  assert(config.enabled === true, 'visualLoop must be explicitly enabled');

  const workflow = String(config.workflow || '').trim();
  const ref = String(config.ref || '').trim();
  assert(WORKFLOW_FILE.test(workflow), 'workflow must be a repository workflow filename');
  assert(REF.test(ref), 'ref is invalid');

  return Object.freeze({ workflow, ref });
}

export function visualLoopDispatchEndpoint(repo, workflow) {
  const name = String(repo || '').trim();
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name), 'repository name is invalid');
  assert(WORKFLOW_FILE.test(String(workflow || '')), 'workflow must be a repository workflow filename');
  return `/repos/${name}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
}

export function rejectVisualLoopOverrides(body = {}) {
  const forbidden = ['workflow', 'ref', 'inputs', 'command', 'shell', 'argv'];
  const supplied = forbidden.filter((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (supplied.length) {
    const error = new Error(`VisualLoop dispatch overrides are forbidden: ${supplied.join(', ')}`);
    error.status = 400;
    throw error;
  }
}
