describe('debug screen environment gate', () => {
  const originalEnv = { ...process.env };
  const originalDev = (global as any).__DEV__;

  afterEach(() => {
    process.env = { ...originalEnv };
    (global as any).__DEV__ = originalDev;
    jest.resetModules();
  });

  it('disables Debug for production builds', () => {
    (global as any).__DEV__ = false;
    process.env.EXPO_PUBLIC_APP_ENV = 'production';

    const { isDebugScreenEnabled } = require('../env') as typeof import('../env');

    expect(isDebugScreenEnabled).toBe(false);
  });

  it('defaults to Debug disabled when the public app env is missing', () => {
    (global as any).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_APP_ENV;

    const { isDebugScreenEnabled } = require('../env') as typeof import('../env');

    expect(isDebugScreenEnabled).toBe(false);
  });

  it('defaults to Debug disabled for unknown public app env values', () => {
    (global as any).__DEV__ = false;
    process.env.EXPO_PUBLIC_APP_ENV = 'staging';

    const { isDebugScreenEnabled } = require('../env') as typeof import('../env');

    expect(isDebugScreenEnabled).toBe(false);
  });

  it('enables Debug in dev builds', () => {
    (global as any).__DEV__ = true;
    process.env.EXPO_PUBLIC_APP_ENV = 'production';

    const { isDebugScreenEnabled } = require('../env') as typeof import('../env');

    expect(isDebugScreenEnabled).toBe(true);
  });

  it('enables Debug for explicit preview QA builds', () => {
    (global as any).__DEV__ = false;
    process.env.EXPO_PUBLIC_APP_ENV = 'preview';

    const { isDebugScreenEnabled } = require('../env') as typeof import('../env');

    expect(isDebugScreenEnabled).toBe(true);
  });
});
