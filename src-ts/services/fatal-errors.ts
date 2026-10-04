export function registerFatalHandlers(
  shutdown: (error: unknown) => void,
  source: Pick<NodeJS.Process, 'on'> = process
): void {
  let triggered = false;
  const fail = (error: unknown): void => {
    console.error('Fatal runtime error:', error);
    if (triggered) return;
    triggered = true;
    shutdown(error);
  };
  source.on('uncaughtException', fail);
  source.on('unhandledRejection', fail);
}
