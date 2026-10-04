import fs from 'node:fs';
import path from 'node:path';

export function writeSnapshot(file: string, payload: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const target of [file, `${file}.bak`]) {
    fs.writeFileSync(`${target}.tmp`, payload, { mode: 0o600, flush: true });
    fs.renameSync(`${target}.tmp`, target);
  }
}

export function createWriteProbe(file: string): () => boolean {
  let checkedAt = 0;
  let writable = false;
  return () => {
    if (checkedAt && Date.now() - checkedAt < 10000) return writable;
    checkedAt = Date.now();
    writable = false;
    const probe = `${file}.health-${process.pid}`;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(probe, 'health', { mode: 0o600, flush: true });
      fs.renameSync(probe, `${probe}.renamed`);
      fs.unlinkSync(`${probe}.renamed`);
      writable = true;
    } catch { /* Expose availability without revealing paths. */ }
    finally {
      for (const name of [probe, `${probe}.renamed`]) try { fs.unlinkSync(name); } catch { /* Already removed. */ }
    }
    return writable;
  };
}
