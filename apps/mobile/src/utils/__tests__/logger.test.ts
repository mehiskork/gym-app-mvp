jest.mock('../../db/db', () => ({
  exec: jest.fn(),
}));

import { exec } from '../../db/db';
import { logEvent, sanitizeLogContext } from '../logger';

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
