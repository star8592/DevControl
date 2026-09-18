import fs from 'node:fs';
import path from 'node:path';
import { createProjectProfile } from './universal-project-profile.mjs';

export function detectProject(root) {
  const has = (file) => fs.existsSync(path.join(root, file));

  if (has('Cargo.toml')) {
    return createProjectProfile({
      name: path.basename(root),
      language: 'rust',
      installCommand: 'cargo build',
      testCommand: 'cargo test',
      buildCommand: 'cargo build',
      confidence: 0.95
    });
  }

  if (has('package.json')) {
    return createProjectProfile({
      name: path.basename(root),
      language: 'javascript',
      installCommand: 'npm install',
      testCommand: 'npm test',
      buildCommand: 'npm run build',
      confidence: 0.9
    });
  }

  if (has('pyproject.toml') || has('requirements.txt')) {
    return createProjectProfile({
      name: path.basename(root),
      language: 'python',
      installCommand: 'pip install -r requirements.txt',
      testCommand: 'pytest',
      confidence: 0.85
    });
  }

  return createProjectProfile({
    name: path.basename(root),
    confidence: 0.2
  });
}
