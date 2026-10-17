export function watchDiscordStartup(
  isReady: () => boolean,
  onTimeout: () => void,
  timeoutMs = 120_000
): () => void {
  const timer = setTimeout(() => { if (!isReady()) onTimeout(); }, timeoutMs);
  timer.unref();
  return () => clearTimeout(timer);
}
