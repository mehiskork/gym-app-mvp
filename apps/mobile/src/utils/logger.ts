import { exec } from '../db/db';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function logEvent(
  level: LogLevel,
  tag: string,
  message: string,
  context?: Record<string, unknown>,
) {
  try {
    const at = Date.now();
    const contextJson = context ? JSON.stringify(context) : null;

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
