jest.mock('../db', () => ({ exec: jest.fn(), query: jest.fn() }));
jest.mock('../sessionDetailRepo', () => ({
  fetchSessionDetail: jest.fn(),
}));

import { fetchSessionDetail } from '../sessionDetailRepo';
import { getSessionDetail } from '../historyRepo';
import { EXERCISE_TYPE } from '../exerciseTypes';

describe('historyRepo getSessionDetail', () => {
  beforeEach(() => {
    (fetchSessionDetail as jest.Mock).mockReset();
  });

  it('returns only performed strength sets when an exercise has placeholders', () => {
    (fetchSessionDetail as jest.Mock).mockReturnValue({
      session: {
        id: 's1',
        title: 'Push',
        started_at: '2026-01-01',
        ended_at: '2026-01-01',
        workout_note: 'Nice session',
      },
      exercises: [
        {
          id: 'wse-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          exercise_type: EXERCISE_TYPE.STRENGTH,
          cardio_profile: null,
          position: 1,
          notes: null,
          cardio_duration_minutes: null,
          cardio_distance_km: null,
          cardio_speed_kph: null,
          cardio_incline_percent: null,
          cardio_resistance_level: null,
          cardio_pace_seconds_per_km: null,
          cardio_floors: null,
          cardio_stair_level: null,
          sets: [
            {
              id: 'set-empty-1',
              workout_session_exercise_id: 'wse-1',
              set_index: 1,
              weight: 0,
              reps: 6,
              rpe: null,
              rest_seconds: null,
              notes: null,
              is_completed: 0,
            },
            {
              id: 'set-empty-2',
              workout_session_exercise_id: 'wse-1',
              set_index: 2,
              weight: null,
              reps: null,
              rpe: null,
              rest_seconds: null,
              notes: null,
              is_completed: 0,
            },
            {
              id: 'set-logged-main',
              workout_session_exercise_id: 'wse-1',
              set_index: 3,
              weight: 60,
              reps: 8,
              rpe: null,
              rest_seconds: 120,
              notes: null,
              is_completed: 1,
            },
          ],
        },
        {
          id: 'wse-2',
          exercise_id: 'ex-2',
          exercise_name: 'Incline Bench Press',
          exercise_type: EXERCISE_TYPE.STRENGTH,
          cardio_profile: null,
          position: 2,
          notes: null,
          cardio_duration_minutes: null,
          cardio_distance_km: null,
          cardio_speed_kph: null,
          cardio_incline_percent: null,
          cardio_resistance_level: null,
          cardio_pace_seconds_per_km: null,
          cardio_floors: null,
          cardio_stair_level: null,
          sets: [
            {
              id: 'set-logged-secondary',
              workout_session_exercise_id: 'wse-2',
              set_index: 1,
              weight: 100,
              reps: 8,
              rpe: null,
              rest_seconds: 90,
              notes: null,
              is_completed: 1,
            },
          ],
        },
      ],
    });

    const detail = getSessionDetail('s1');

    expect(detail?.exercises.map((exercise) => exercise.id)).toEqual(['wse-1', 'wse-2']);
    expect(
      detail?.sets
        .filter((set) => set.workout_session_exercise_id === 'wse-1')
        .map((set) => set.id),
    ).toEqual(['set-logged-main']);
    expect(detail?.sets.map((set) => set.id)).toEqual(['set-logged-main', 'set-logged-secondary']);
  });

  it('omits strength exercises that only contain untouched placeholder sets', () => {
    (fetchSessionDetail as jest.Mock).mockReturnValue({
      session: {
        id: 's3',
        title: 'Leg day',
        started_at: '2026-01-03',
        ended_at: '2026-01-03',
        workout_note: null,
      },
      exercises: [
        {
          id: 'wse-strength-placeholders',
          exercise_id: 'ex-legs-1',
          exercise_name: 'Back Squat',
          exercise_type: EXERCISE_TYPE.STRENGTH,
          cardio_profile: null,
          position: 1,
          notes: null,
          cardio_duration_minutes: null,
          cardio_distance_km: null,
          cardio_speed_kph: null,
          cardio_incline_percent: null,
          cardio_resistance_level: null,
          cardio_pace_seconds_per_km: null,
          cardio_floors: null,
          cardio_stair_level: null,
          sets: [
            {
              id: 'set-placeholder-1',
              workout_session_exercise_id: 'wse-strength-placeholders',
              set_index: 1,
              weight: null,
              reps: null,
              rpe: null,
              rest_seconds: null,
              notes: null,
              is_completed: 0,
            },
            {
              id: 'set-placeholder-2',
              workout_session_exercise_id: 'wse-strength-placeholders',
              set_index: 2,
              weight: null,
              reps: null,
              rpe: null,
              rest_seconds: null,
              notes: '   ',
              is_completed: 0,
            },
          ],
        },
      ],
    });

    const detail = getSessionDetail('s3');

    expect(detail?.exercises).toEqual([]);
    expect(detail?.sets).toEqual([]);
  });

  it('excludes unchecked strength sets even when numbers are entered', () => {
    (fetchSessionDetail as jest.Mock).mockReturnValue({
      session: {
        id: 's4',
        title: 'Pull day',
        started_at: '2026-01-04',
        ended_at: '2026-01-04',
        workout_note: null,
      },
      exercises: [
        {
          id: 'wse-strength-unchecked-numeric',
          exercise_id: 'ex-pull-1',
          exercise_name: 'Barbell Row',
          exercise_type: EXERCISE_TYPE.STRENGTH,
          cardio_profile: null,
          position: 1,
          notes: null,
          cardio_duration_minutes: null,
          cardio_distance_km: null,
          cardio_speed_kph: null,
          cardio_incline_percent: null,
          cardio_resistance_level: null,
          cardio_pace_seconds_per_km: null,
          cardio_floors: null,
          cardio_stair_level: null,
          sets: [
            {
              id: 'set-unchecked-numeric-1',
              workout_session_exercise_id: 'wse-strength-unchecked-numeric',
              set_index: 1,
              weight: 80,
              reps: 6,
              rpe: 8,
              rest_seconds: 120,
              notes: 'felt strong',
              is_completed: 0,
            },
          ],
        },
      ],
    });

    const detail = getSessionDetail('s4');

    expect(detail?.exercises).toEqual([]);
    expect(detail?.sets).toEqual([]);
  });
  it('includes cardio only when cardio summary data is present', () => {
    (fetchSessionDetail as jest.Mock).mockReturnValue({
      session: {
        id: 's2',
        title: 'Cardio day',
        started_at: '2026-01-02',
        ended_at: '2026-01-02',
        workout_note: null,
      },
      exercises: [
        {
          id: 'wse-cardio-empty',
          exercise_id: 'ex-cardio-1',
          exercise_name: 'Treadmill',
          exercise_type: EXERCISE_TYPE.CARDIO,
          cardio_profile: 'treadmill',
          position: 1,
          notes: null,
          cardio_duration_minutes: null,
          cardio_distance_km: null,
          cardio_speed_kph: null,
          cardio_incline_percent: null,
          cardio_resistance_level: null,
          cardio_pace_seconds_per_km: null,
          cardio_floors: null,
          cardio_stair_level: null,
          sets: [],
        },
        {
          id: 'wse-cardio-logged',
          exercise_id: 'ex-cardio-2',
          exercise_name: 'Bike',
          exercise_type: EXERCISE_TYPE.CARDIO,
          cardio_profile: 'bike',
          position: 2,
          notes: null,
          cardio_duration_minutes: 20,
          cardio_distance_km: null,
          cardio_speed_kph: null,
          cardio_incline_percent: null,
          cardio_resistance_level: null,
          cardio_pace_seconds_per_km: null,
          cardio_floors: null,
          cardio_stair_level: null,
          sets: [],
        },
      ],
    });
    const detail = getSessionDetail('s2');

    expect(detail?.exercises.map((exercise) => exercise.id)).toEqual(['wse-cardio-logged']);
    expect(detail?.sets).toEqual([]);
  });
});
