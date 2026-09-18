export function analyzeFailure(input = {}) {
  const text = String(input.logs || input.error || '').toLowerCase();
  const signals = [];
  let category = 'unknown';
  let suggestion = 'collect more diagnostics';

  if (text.includes('cannot find module') || text.includes('module not found')) {
    category = 'dependency';
    suggestion = 'install missing dependency and refresh lockfile';
    signals.push('missing-module');
  } else if (text.includes('cargo') && text.includes('failed')) {
    category = 'rust-build';
    suggestion = 'run cargo check and inspect compiler diagnostics';
    signals.push('cargo-failure');
  } else if (text.includes('permission denied')) {
    category = 'permission';
    suggestion = 'verify filesystem permissions and runner identity';
    signals.push('permission-error');
  }

  return {
    category,
    suggestion,
    signals,
    confidence: signals.length ? 0.8 : 0.2,
  };
}
