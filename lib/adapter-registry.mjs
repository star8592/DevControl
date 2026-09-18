const adapters = [
  {
    id: 'rust',
    detect(project) {
      return Boolean(project.files?.includes('Cargo.toml'));
    },
    commands: {
      check: 'cargo check',
      test: 'cargo test',
      build: 'cargo build'
    }
  },
  {
    id: 'node',
    detect(project) {
      return Boolean(project.files?.includes('package.json'));
    },
    commands: {
      install: 'npm install',
      test: 'npm test',
      build: 'npm run build'
    }
  },
  {
    id: 'python',
    detect(project) {
      return Boolean(project.files?.includes('pyproject.toml') || project.files?.includes('requirements.txt'));
    },
    commands: {
      test: 'pytest'
    }
  }
];

export function detectAdapter(project) {
  return adapters.find((adapter) => adapter.detect(project)) ?? {
    id: 'generic',
    commands: {}
  };
}

export function listAdapters() {
  return adapters.map((adapter) => adapter.id);
}
