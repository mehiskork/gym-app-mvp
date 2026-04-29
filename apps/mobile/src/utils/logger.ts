import { exec } from '../db/db';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REDACTED = '[REDACTED]';
const MAX_STRING_LENGTH = 1000;
const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_KEYS = 100;
const SENSITIVE_KEYS = new Set([
  'authorization',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'firebaseidtoken',
  'devicetoken',
  'token',
  'secret',
  'password',
  'sessionsecret',
  'securestore',
  'apikey',
]);

export function sanitizeLogContext(value: unknown): unknown {
  return sanitizeValue(value, 0);
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`
      : value;
  }

  if (depth >= 8) {
    return '[MAX_DEPTH]';
  }

  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeValue(item, depth + 1));
    if (value.length > MAX_ARRAY_LENGTH) {
      sanitized.push(`[${value.length - MAX_ARRAY_LENGTH} more items truncated]`);
    }
    return sanitized;
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    for (const [key, item] of entries) {
      output[key] = isSensitiveKey(key) ? REDACTED : sanitizeValue(item, depth + 1);
    }
    const extraCount = Object.keys(value as Record<string, unknown>).length - entries.length;
    if (extraCount > 0) {
      output.__truncatedKeys = extraCount;
    }
    return output;
  }

  return String(value);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.replace(/[^A-Za-z0-9]/g, '').toLowerCase());
}

export function logEvent(
  level: LogLevel,
  tag: string,
  message: string,
  context?: Record<string, unknown>,
) {
  try {
    const at = Date.now();
    const contextJson = context ? JSON.stringify(sanitizeLogContext(context)) : null;

    exec(`INSERT INTO app_log (at, level, tag, message, context_json) VALUES (?, ?, ?, ?, ?)`, [
      at,
      level,
      tag,
      message,
      contextJson,
    ]);
  } catch {
    // Never let logging crash the app
  }
}
