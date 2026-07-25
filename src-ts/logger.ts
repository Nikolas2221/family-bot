type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  meta?: Record<string, unknown>;
  error?: Error;
}

interface LoggerOptions {
  level?: LogLevel;
  service?: string;
  pretty?: boolean;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

function formatEntry(entry: LogEntry, pretty: boolean): string {
  const base = {
    level: entry.level.toUpperCase(),
    message: entry.message,
    timestamp: entry.timestamp,
    service: entry.service,
    ...entry.meta
  };

  if (entry.error) {
    base['error'] = {
      name: entry.error.name,
      message: entry.error.message,
      stack: entry.error.stack
    };
  }

  if (pretty) {
    const color = entry.level === 'error' ? '\x1b[31m' : entry.level === 'warn' ? '\x1b[33m' : entry.level === 'info' ? '\x1b[36m' : '\x1b[90m';
    const reset = '\x1b[0m';
    const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
    const errStr = entry.error ? ` \n${entry.error.stack}` : '';
    return `${color}[${entry.timestamp}]${reset} ${entry.level.toUpperCase().padEnd(5)} ${entry.service}: ${entry.message}${metaStr}${errStr}`;
  }

  return JSON.stringify(base);
}

export function createLogger(options: LoggerOptions = {}) {
  const { level = 'info', service = 'app', pretty = process.stdout.isTTY } = options;
  const minPriority = LEVEL_PRIORITY[level];

  function shouldLog(logLevel: LogLevel): boolean {
    return LEVEL_PRIORITY[logLevel] >= minPriority;
  }

  function log(logLevel: LogLevel, message: string, meta?: Record<string, unknown>, error?: Error): void {
    if (!shouldLog(logLevel)) return;

    const entry: LogEntry = {
      level: logLevel,
      message,
      timestamp: new Date().toISOString(),
      service,
      meta,
      error
    };

    const output = formatEntry(entry, pretty);
    if (logLevel === 'error' || logLevel === 'warn') {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  return {
    debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
    info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
    error: (message: string, meta?: Record<string, unknown>, error?: Error) => log('error', message, meta, error),
    child: (childMeta: Record<string, unknown>) => createLogger({ level, service: `${service}:${childMeta.name || 'child'}`, pretty }),
    setLevel: (newLevel: LogLevel) => { minPriority = LEVEL_PRIORITY[newLevel]; }
  };
}

export const defaultLogger = createLogger({ service: 'KLAIZ' });
