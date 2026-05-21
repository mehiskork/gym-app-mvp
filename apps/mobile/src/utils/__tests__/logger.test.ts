jest.mock('../../db/db', () => ({
  exec: jest.fn(),
}));

import { exec } from '../../db/db';
import { logEvent, sanitizeLogContext } from '../logger';

const JWT_TOKEN =
  'eyJhbGciOiJSUzI1NiIsImtpZCI6ImtpZDEifQ.eyJzdWIiOiJmaXJlYmFzZS11aWQiLCJhdWQiOiJneW0tYXBwIn0.c2lnbmF0dXJlLXZhbHVlLTEyMzQ1Njc4OTA';
const API_KEY = ['AI', 'za', 'SyD1234567890abcdefghijklmnopqrstuv'].join('');
const OPAQUE_TOKEN = 'abcDEF1234567890abcDEF1234567890abcDEF1234567890';

describe('logger sanitization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sanitizes top-level sensitive keys before writing app_log context', () => {
    logEvent('info', 'auth', 'token test', {
      accessToken: 'firebase-id-token',
      refreshToken: 'refresh-token',
      deviceToken: 'device-token',
      safeField: 'kept',
    });

    const params = (exec as jest.Mock).mock.calls[0][1] as unknown[];
    const context = JSON.parse(params[4] as string);
    expect(context).toEqual({
      accessToken: '[REDACTED]',
      refreshToken: '[REDACTED]',
      deviceToken: '[REDACTED]',
      safeField: 'kept',
    });
  });

  it('sanitizes nested sensitive keys and arrays', () => {
    const sanitized = sanitizeLogContext({
      headers: {
        Authorization: 'Bearer secret',
      },
      nested: [
        {
          firebaseIdToken: 'id-token',
          sessionSecret: 'session-secret',
          message: 'safe',
        },
      ],
    });

    expect(sanitized).toEqual({
      headers: {
        Authorization: '[REDACTED]',
      },
      nested: [
        {
          firebaseIdToken: '[REDACTED]',
          sessionSecret: '[REDACTED]',
          message: 'safe',
        },
      ],
    });
  });

  it('redacts JWT-like string values under harmless keys', () => {
    const sanitized = sanitizeLogContext({
      note: JWT_TOKEN,
      entityId: 'workout_set_550e8400-e29b-41d4-a716-446655440000',
    });
    const json = JSON.stringify(sanitized);

    expect(json).toContain('[REDACTED_TOKEN]');
    expect(json).not.toContain(JWT_TOKEN);
    expect(json).toContain('workout_set_550e8400-e29b-41d4-a716-446655440000');
  });

  it('redacts JWT-like tokens embedded in log messages', () => {
    logEvent('warn', 'sync', `sync failed with credential ${JWT_TOKEN}`, {
      entityType: 'program_day_exercise',
    });

    const params = (exec as jest.Mock).mock.calls[0][1] as unknown[];
    expect(params[3]).toBe('sync failed with credential [REDACTED_TOKEN]');
    expect(params[3]).not.toContain(JWT_TOKEN);
  });

  it('redacts bearer tokens embedded in string values', () => {
    const sanitized = sanitizeLogContext({
      detail: `request failed Authorization: Bearer ${JWT_TOKEN}`,
    });
    const json = JSON.stringify(sanitized);

    expect(json).toContain('Bearer [REDACTED_TOKEN]');
    expect(json).not.toContain(JWT_TOKEN);
  });

  it('redacts token-shaped values inside nested arrays and objects', () => {
    const sanitized = sanitizeLogContext({
      attempts: [
        {
          label: 'retry',
          rawResponse: {
            message: `api key ${API_KEY}`,
            fallback: OPAQUE_TOKEN,
          },
        },
      ],
    });
    const json = JSON.stringify(sanitized);

    expect(json).toContain('[REDACTED_TOKEN]');
    expect(json).not.toContain(API_KEY);
    expect(json).not.toContain(OPAQUE_TOKEN);
  });

  it('preserves normal diagnostic values', () => {
    const sanitized = sanitizeLogContext({
      exerciseName: 'Barbell Back Squat',
      entityType: 'workout_set',
      entityId: 'workout_set_550e8400-e29b-41d4-a716-446655440000',
      routeName: 'WorkoutSession',
      capturedAt: '2026-05-18T12:34:56.000Z',
      shortValue: 'day-1',
    });

    expect(sanitized).toEqual({
      exerciseName: 'Barbell Back Squat',
      entityType: 'workout_set',
      entityId: 'workout_set_550e8400-e29b-41d4-a716-446655440000',
      routeName: 'WorkoutSession',
      capturedAt: '2026-05-18T12:34:56.000Z',
      shortValue: 'day-1',
    });
  });

  it('sanitizes old raw app_log context before export', () => {
    const rawOldContext = JSON.parse(
      JSON.stringify({
        token: 'old-token',
        auth: {
          password: 'old-password',
          secureStore: {
            refreshToken: 'old-refresh-token',
          },
        },
        diagnostic: {
          entityType: 'program_day_exercise',
          position: 1,
        },
      }),
    );

    const sanitized = sanitizeLogContext(rawOldContext);
    const json = JSON.stringify(sanitized);

    expect(json).not.toContain('old-token');
    expect(json).not.toContain('old-password');
    expect(json).not.toContain('old-refresh-token');
    expect(sanitized).toEqual(
      expect.objectContaining({
        diagnostic: {
          entityType: 'program_day_exercise',
          position: 1,
        },
      }),
    );
  });

  it('bounds large context values', () => {
    const sanitized = sanitizeLogContext({
      large: 'x'.repeat(1200),
    }) as { large: string };

    expect(sanitized.large).toHaveLength(1014);
    expect(sanitized.large).toContain('[truncated]');
  });
});
