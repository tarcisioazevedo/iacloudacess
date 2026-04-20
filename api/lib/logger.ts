/**
 * Structured JSON logger for production.
 * In Swarm, logs are collected by the Docker daemon and forwarded
 * to centralized logging (Loki, ELK, etc.)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  [key: string]: unknown;
}

const SERVICE_NAME = process.env.SERVICE_NAME || 'school-api';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function formatLog(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  if (!IS_PRODUCTION) {
    // Dev: human-readable colored output
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m',
    };
    const prefix = `${colors[level]}[${level.toUpperCase()}]\x1b[0m`;
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `${prefix} ${message}${metaStr}`;
  }

  // Production: JSON for centralized log collection
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: SERVICE_NAME,
    ...meta,
  };
  return JSON.stringify(entry);
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (!IS_PRODUCTION) console.debug(formatLog('debug', message, meta));
  },
  info(message: string, meta?: Record<string, unknown>) {
    console.log(formatLog('info', message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(formatLog('warn', message, meta));
  },
  error(message: string, meta?: Record<string, unknown>) {
    console.error(formatLog('error', message, meta));
  },
};
