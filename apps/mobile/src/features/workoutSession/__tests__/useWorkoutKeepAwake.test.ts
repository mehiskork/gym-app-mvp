const mockEffectCleanups: Array<() => void> = [];

jest.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (typeof cleanup === 'function') mockEffectCleanups.push(cleanup);
  },
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(),
  deactivateKeepAwake: jest.fn(),
}));

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { WORKOUT_SESSION_STATUS } from '../../../db/constants';
import { useWorkoutKeepAwake } from '../useWorkoutKeepAwake';

const KEEP_AWAKE_TAG = 'workout-session';

describe('useWorkoutKeepAwake', () => {
  beforeEach(() => {
    mockEffectCleanups.length = 0;
    (activateKeepAwakeAsync as jest.Mock).mockClear();
    (deactivateKeepAwake as jest.Mock).mockClear();
  });

  it('activates keep-awake when focused, in progress, and enabled', () => {
    useWorkoutKeepAwake({
      isFocused: true,
      keepScreenOn: true,
      sessionStatus: WORKOUT_SESSION_STATUS.IN_PROGRESS,
    });

    expect(activateKeepAwakeAsync).toHaveBeenCalledWith(KEEP_AWAKE_TAG);
    expect(deactivateKeepAwake).not.toHaveBeenCalled();
  });

  it('deactivates and does not activate when not focused', () => {
    useWorkoutKeepAwake({
      isFocused: false,
      keepScreenOn: true,
      sessionStatus: WORKOUT_SESSION_STATUS.IN_PROGRESS,
    });

    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
    expect(deactivateKeepAwake).toHaveBeenCalledWith(KEEP_AWAKE_TAG);
  });

  it('deactivates and does not activate when keep-screen-on is disabled', () => {
    useWorkoutKeepAwake({
      isFocused: true,
      keepScreenOn: false,
      sessionStatus: WORKOUT_SESSION_STATUS.IN_PROGRESS,
    });

    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
    expect(deactivateKeepAwake).toHaveBeenCalledWith(KEEP_AWAKE_TAG);
  });

  it('deactivates and does not activate when the session is completed', () => {
    useWorkoutKeepAwake({
      isFocused: true,
      keepScreenOn: true,
      sessionStatus: WORKOUT_SESSION_STATUS.COMPLETED,
    });

    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
    expect(deactivateKeepAwake).toHaveBeenCalledWith(KEEP_AWAKE_TAG);
  });

  it('deactivates and does not activate when the session is discarded', () => {
    useWorkoutKeepAwake({
      isFocused: true,
      keepScreenOn: true,
      sessionStatus: WORKOUT_SESSION_STATUS.DISCARDED,
    });

    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
    expect(deactivateKeepAwake).toHaveBeenCalledWith(KEEP_AWAKE_TAG);
  });

  it('deactivates and does not activate when the session status is missing', () => {
    useWorkoutKeepAwake({
      isFocused: true,
      keepScreenOn: true,
      sessionStatus: undefined,
    });

    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
    expect(deactivateKeepAwake).toHaveBeenCalledWith(KEEP_AWAKE_TAG);
  });

  it('deactivates keep-awake on active cleanup', () => {
    useWorkoutKeepAwake({
      isFocused: true,
      keepScreenOn: true,
      sessionStatus: WORKOUT_SESSION_STATUS.IN_PROGRESS,
    });

    mockEffectCleanups.forEach((cleanup) => cleanup());

    expect(deactivateKeepAwake).toHaveBeenCalledWith(KEEP_AWAKE_TAG);
  });

  it('deactivates when a later render changes from active to inactive', () => {
    useWorkoutKeepAwake({
      isFocused: true,
      keepScreenOn: true,
      sessionStatus: WORKOUT_SESSION_STATUS.IN_PROGRESS,
    });
    mockEffectCleanups.forEach((cleanup) => cleanup());
    (deactivateKeepAwake as jest.Mock).mockClear();

    useWorkoutKeepAwake({
      isFocused: false,
      keepScreenOn: true,
      sessionStatus: WORKOUT_SESSION_STATUS.IN_PROGRESS,
    });

    expect(deactivateKeepAwake).toHaveBeenCalledWith(KEEP_AWAKE_TAG);
  });
});
