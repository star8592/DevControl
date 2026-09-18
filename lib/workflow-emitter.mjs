export function emitWorkflow(profile = {}) {
  const language = profile.language || profile.adapter || 'generic';
  const steps = {
    rust: ['cargo fmt --check', 'cargo test', 'cargo build --release'],
    node: ['npm ci', 'npm test', 'npm run build'],
    python: ['python -m pytest'],
    godot: ['godot --headless --quit'],
    docker: ['docker build .'],
    generic: ['echo "DevControl generic qualification"']
  }[language] || ['echo "DevControl qualification"'];

  return `name: DevControl Qualification\n\non:\n  workflow_dispatch:\n  pull_request:\n\njobs:\n  qualify:\n    runs-on: self-hosted\n    steps:\n      - uses: actions/checkout@v4\n${steps.map(step => `      - name: ${step}\n        run: ${step}`).join('\n')}\n`;
}
