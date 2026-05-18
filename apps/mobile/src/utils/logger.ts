import { exec } from '../db/db';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REDACTED = '[REDACTED]';
const REDACTED_TOKEN = '[REDACTED_TOKEN]';
const MAX_STRING_LENGTH = 1000;
const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_KEYS = 100;
const JWT_LIKE_PATTERN =
  /(^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})(?=$|[^A-Za-z0-9_-])/g;
const BEARER_TOKEN_PATTERN = /\b(Bearer)\s+([A-Za-z0-9._~+/=-]{16,})/gi;
const GOOGLE_API_KEY_PATTERN = /\bAIza[0-9A-Za-z_-]{35}\b/g;
const LONG_OPAQUE_TOKEN_PATTERN = /\b[A-Za-z0-9+/=]{48,}\b/g;
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

export function sanitizeLogString(value: string): string {
  const redacted = value
    .replace(BEARER_TOKEN_PATTERN, `$1 ${REDACTED_TOKEN}`)
    .replace(JWT_LIKE_PATTERN, (_match, prefix: string) => `${prefix}${REDACTED_TOKEN}`)
    .replace(GOOGLE_API_KEY_PATTERN, REDACTED_TOKEN)
    .replace(LONG_OPAQUE_TOKEN_PATTERN, (match) =>
      /[A-Za-z]/.test(match) && /\d/.test(match) ? REDACTED_TOKEN : match,
    );

  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}...[truncated]`
    : redacted;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeLogString(value);
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
    const safeMessage = sanitizeLogString(message);
    const contextJson = context ? JSON.stringify(sanitizeLogContext(context)) : null;

    exec(`INSERT INTO app_log (at, level, tag, message, context_json) VALUES (?, ?, ?, ?, ?)`, [
      at,
      level,
      tag,
      safeMessage,
      contextJson,
    ]);
  } catch {
    // Never let logging crash the app
  }
}
