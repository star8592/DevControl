import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function defaultAuditPath() {
  const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(stateHome, 'devcontrol', 'audit.ndjson');
}

export function createAuditLog() {
  const filePath = path.resolve(process.env.DEVCONTROL_AUDIT_FILE || defaultAuditPath());

  async function append(record) {
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const safeRecord = {
      at: new Date().toISOString(),
      ...record
    };
    delete safeRecord.token;
    delete safeRecord.authorization;
    delete safeRecord.headers;
    await appendFile(filePath, `${JSON.stringify(safeRecord)}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  async function recent(limit = 50) {
    const bounded = Math.max(1, Math.min(200, Number(limit) || 50));
    try {
      const text = await readFile(filePath, 'utf8');
      return text
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-bounded)
        .map(line => {
          try { return JSON.parse(line); } catch { return { at: null, outcome: 'corrupt-record' }; }
        })
        .reverse();
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  return { filePath, append, recent };
}
