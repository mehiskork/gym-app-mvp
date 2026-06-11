const mockRefs: Array<{ current: unknown }> = [];
let mockRefIndex = 0;

jest.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: jest.fn((callback: () => void) => callback()),
  useMemo: (fn: () => unknown) => fn(),
  useRef: jest.fn((initial: unknown) => {
    const existing = mockRefs[mockRefIndex];
    if (existing) {
      mockRefIndex += 1;
      return existing;
    }
    const next = { current: initial };
    mockRefs.push(next);
    mockRefIndex += 1;
    return next;
  }),
}));

jest.mock('../../../db/workoutLoggerRepo', () => ({
  clearRestTimer: jest.fn(),
}));

jest.mock('../../../utils/restTimer', () => ({
  maybeTriggerRestTimerHaptics: jest.fn(),
}));

jest.mock('../../../utils/restTimerNotifications', () => ({
  cancelRestTimerNotification: jest.fn(),
}));

import { clearRestTimer, type LoggerSession } from '../../../db/workoutLoggerRepo';
import { maybeTriggerRestTimerHaptics } from '../../../utils/restTimer';
import { cancelRestTimerNotification } from '../../../utils/restTimerNotifications';
import { useRestTimer } from '../useRestTimer';

function createSession(overrides?: Partial<LoggerSession>): LoggerSession {
  return {
    id: 'session-1',
    title: 'Push Day',
    status: 'in_progress',
    started_at: '2024-01-01T00:00:00Z',
    completed_at: null,
    workout_note: null,
    rest_timer_end_at: null,
    rest_timer_seconds: null,
    rest_timer_label: null,
    ...overrides,
  } as LoggerSession;
}

describe('useRestTimer', () => {
  beforeEach(() => {
    mockRefs.length = 0;
    mockRefIndex = 0;
    (clearRestTimer as jest.Mock).mockReset();
    (maybeTriggerRestTimerHaptics as jest.Mock).mockReset();
    (cancelRestTimerNotification as jest.Mock).mockReset();
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T00:00:00Z').getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns active timer state with expected remaining seconds', () => {
    const result = useRestTimer({
      session: createSession({ rest_timer_end_at: '2024-01-01T00:01:30Z' }),
      sessionId: 'session-1',
      tick: 0,
      vibrationEnabled: true,
      setSession: jest.fn(),
    });

    expect(result.timerActive).toBe(true);
    expect(result.remainingSeconds).toBe(90);
  });

  it('returns inactive timer state when rest_timer_end_at is absent', () => {
    mockRefs.push({ current: true }, { current: 30 });

    const result = useRestTimer({
      session: createSession({ rest_timer_end_at: null }),
      sessionId: 'session-1',
      tick: 0,
      vibrationEnabled: true,
      setSession: jest.fn(),
    });

    expect(result.timerActive).toBe(false);
    expect(result.remainingSeconds).toBe(0);
    expect(mockRefs[0]?.current).toBe(false);
    expect(mockRefs[1]?.current).toBe(null);
    expect(maybeTriggerRestTimerHaptics).not.toHaveBeenCalled();
  });

  it('clamps expired timer remaining seconds to zero', () => {
    const result = useRestTimer({
      session: createSession({ rest_timer_end_at: '2023-12-31T23:59:30Z' }),
      sessionId: 'session-1',
      tick: 0,
      vibrationEnabled: true,
      setSession: jest.fn(),
    });

    expect(result.timerActive).toBe(true);
    expect(result.remainingSeconds).toBe(0);
  });

  it('does not trigger haptics when mounting an already-completed timer', () => {
    useRestTimer({
      session: createSession({ rest_timer_end_at: '2024-01-01T00:00:00Z' }),
      sessionId: 'session-1',
      tick: 0,
      vibrationEnabled: true,
      setSession: jest.fn(),
    });

    expect(maybeTriggerRestTimerHaptics).not.toHaveBeenCalled();
  });

  it('passes completed timer state to haptic utility after crossing from positive remaining time', () => {
    useRestTimer({
      session: createSession({ rest_timer_end_at: '2024-01-01T00:00:10Z' }),
      sessionId: 'session-1',
      tick: 0,
      vibrationEnabled: true,
      setSession: jest.fn(),
    });
    mockRefIndex = 0;
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T00:00:10Z').getTime());

    useRestTimer({
      session: createSession({ rest_timer_end_at: '2024-01-01T00:00:00Z' }),
      sessionId: 'session-1',
      tick: 0,
      vibrationEnabled: true,
      setSession: jest.fn(),
    });

    expect(maybeTriggerRestTimerHaptics).toHaveBeenLastCalledWith(0, true, mockRefs[0]);
  });

  it('passes disabled vibration setting after crossing from positive remaining time', () => {
    useRestTimer({
      session: createSession({ rest_timer_end_at: '2024-01-01T00:00:10Z' }),
      sessionId: 'session-1',
      tick: 0,
      vibrationEnabled: false,
      setSession: jest.fn(),
    });
    mockRefIndex = 0;
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T00:00:10Z').getTime());

    useRestTimer({
      session: createSession({ rest_timer_end_at: '2024-01-01T00:00:00Z' }),
      sessionId: 'session-1',
      tick: 0,
      vibrationEnabled: false,
      setSession: jest.fn(),
    });

    expect(maybeTriggerRestTimerHaptics).toHaveBeenLastCalledWith(0, false, mockRefs[0]);
  });

  it('clearRestTimerHandler optimistically clears rest timer fields and preserves session fields', () => {
    const session = createSession({
      rest_timer_end_at: '2024-01-01T00:01:00Z',
      rest_timer_label: 'Bench Press',
      rest_timer_seconds: 60,
      workout_note: 'Felt strong',
    });
    const setSession = jest.fn();
    const { clearRestTimerHandler } = useRestTimer({
      session,
      sessionId: 'session-1',
      tick: 0,
      vibrationEnabled: true,
      setSession,
    });

    clearRestTimerHandler();

    expect(setSession).toHaveBeenCalledWith(expect.any(Function));
    const updater = setSession.mock.calls[0]?.[0];
    expect(updater(session)).toEqual({
      ...session,
      rest_timer_end_at: null,
      rest_timer_label: null,
      rest_timer_seconds: null,
    });
  });

  it('clearRestTimerHandler calls repository clear and cancels notification', () => {
    const { clearRestTimerHandler } = useRestTimer({
      session: createSession({ rest_timer_end_at: '2024-01-01T00:01:00Z' }),
      sessionId: 'session-1',
      tick: 0,
      vibrationEnabled: true,
      setSession: jest.fn(),
    });

    clearRestTimerHandler();

    expect(clearRestTimer).toHaveBeenCalledWith('session-1');
    expect(cancelRestTimerNotification).toHaveBeenCalledTimes(1);
  });
});
