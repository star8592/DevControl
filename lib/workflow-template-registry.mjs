export const workflowTemplates = {
  rust: {
    install: 'cargo build',
    test: 'cargo test',
    build: 'cargo build --release',
  },
  node: {
    install: 'npm ci',
    test: 'npm test',
    build: 'npm run build',
  },
  python: {
    install: 'python -m pip install -r requirements.txt',
    test: 'pytest',
    build: null,
  },
  generic: {
    install: null,
    test: null,
    build: null,
  },
};

export function getWorkflowTemplate(type = 'generic') {
  return workflowTemplates[type] ?? workflowTemplates.generic;
}
