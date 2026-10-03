let stopping = false;
const active = new Set<Promise<unknown>>();
export function isStopping(): boolean { return stopping; }
export async function trackWork<T>(work: () => Promise<T>): Promise<T | undefined> {
  if (stopping) return undefined;
  const pending = work();
  active.add(pending);
  try { return await pending; } finally { active.delete(pending); }
}
export async function drainWork(timeoutMs = 20000): Promise<boolean> {
  stopping = true;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      Promise.allSettled([...active]).then(() => true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
