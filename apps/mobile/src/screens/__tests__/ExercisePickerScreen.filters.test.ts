import { filterExercises, toggleSingleSelect } from '../exercisePickerFilters';
import { EXERCISE_TYPE } from '../../db/exerciseTypes';
import type { ExerciseRow } from '../../db/exerciseRepo';

function exercise(input: {
  id: string;
  name: string;
  isCustom?: boolean;
  type?: ExerciseRow['exercise_type'];
  cardioProfile?: ExerciseRow['cardio_profile'];
  ownerUserId?: string | null;
}): ExerciseRow {
  return {
    id: input.id,
    name: input.name,
    normalized_name: input.name.trim().toLowerCase(),
    is_custom: input.isCustom ? 1 : 0,
    owner_user_id: input.ownerUserId ?? (input.isCustom ? 'u1' : null),
    exercise_type: input.type ?? EXERCISE_TYPE.STRENGTH,
    cardio_profile: input.cardioProfile ?? null,
    is_favorite: 0,
  };
}

const fixtures: ExerciseRow[] = [
  {
    id: 'ex-1',
    name: 'Bench Press',
    normalized_name: 'bench press',
    is_custom: 0,
    owner_user_id: null,
    exercise_type: EXERCISE_TYPE.STRENGTH,
    cardio_profile: null,
    is_favorite: 0,
  },
  {
    id: 'ex-2',
    name: 'Custom Push Up',
    normalized_name: 'custom push up',
    is_custom: 1,
    owner_user_id: 'u1',
    exercise_type: EXERCISE_TYPE.STRENGTH,
    cardio_profile: null,
    is_favorite: 0,
  },
  {
    id: 'ex-3',
    name: 'Run',
    normalized_name: 'run',
    is_custom: 0,
    owner_user_id: null,
    exercise_type: EXERCISE_TYPE.CARDIO,
    cardio_profile: 'treadmill',
    is_favorite: 0,
  },
  {
    id: 'ex-4',
    name: 'Custom Bike',
    normalized_name: 'custom bike',
    is_custom: 1,
    owner_user_id: 'u1',
    exercise_type: EXERCISE_TYPE.CARDIO,
    cardio_profile: 'bike',
    is_favorite: 0,
  },
];

const searchFixtures: ExerciseRow[] = [
  exercise({ id: 'ex_overhead_press_barbell', name: 'Barbell Overhead Press' }),
  exercise({ id: 'ex_military_press', name: 'Military Press' }),
  exercise({ id: 'ex_dumbbell_shoulder_press', name: 'Dumbbell Shoulder Press' }),
  exercise({ id: 'ex_bb_rdl', name: 'Barbell RDL' }),
  exercise({ id: 'ex_romanian_deadlift_dumbbell', name: 'Dumbbell RDL' }),
  exercise({ id: 'ex_hack_squat_machine_rdl', name: 'Hack Squat Machine RDL' }),
  exercise({ id: 'ex_pullup', name: 'Pull-Up' }),
  exercise({ id: 'ex_assisted_pullup', name: 'Assisted Pull-Up' }),
  exercise({ id: 'ex_lat_pulldown', name: 'Lat Pulldown' }),
  exercise({ id: 'ex_seated_cable_row', name: 'Seated Cable Row' }),
  exercise({ id: 'ex_close_grip_cable_row', name: 'Close-Grip Cable Row' }),
  exercise({ id: 'ex_cable_tricep_pushdown', name: 'Cable Tricep Pushdown' }),
  exercise({ id: 'ex_triceps_pushdown', name: 'Triceps Pushdown' }),
  exercise({ id: 'ex_rope_triceps_pushdown', name: 'Rope Triceps Pushdown' }),
  exercise({ id: 'ex_ez_bar_curl', name: 'EZ-Bar Curl' }),
  exercise({ id: 'ex_reverse_pec_deck', name: 'Reverse Pec Deck' }),
  exercise({ id: 'ex_pec_deck', name: 'Pec Deck' }),
  exercise({ id: 'ex_chest_fly_machine', name: 'Chest Fly (Machine)' }),
  exercise({ id: 'ex_chest_press_machine', name: 'Chest Press Machine' }),
  exercise({ id: 'ex_machine_chest_press', name: 'Machine Chest Press' }),
  exercise({ id: 'ex_shoulder_press_machine', name: 'Shoulder Press Machine' }),
  exercise({ id: 'ex_machine_shoulder_press', name: 'Machine Shoulder Press' }),
  exercise({ id: 'ex_custom_db_press', name: 'Garage DB Press', isCustom: true }),
  exercise({
    id: 'ex_custom_bike',
    name: 'Custom Bike',
    isCustom: true,
    type: EXERCISE_TYPE.CARDIO,
  }),
  exercise({
    id: 'ex_treadmill_run',
    name: 'Treadmill',
    type: EXERCISE_TYPE.CARDIO,
    cardioProfile: 'treadmill',
  }),
];

describe('ExercisePickerScreen filters', () => {
  it('toggles within a single-select group', () => {
    expect(toggleSingleSelect(null, EXERCISE_TYPE.STRENGTH)).toBe(EXERCISE_TYPE.STRENGTH);
    expect(toggleSingleSelect(EXERCISE_TYPE.STRENGTH, EXERCISE_TYPE.CARDIO)).toBe(
      EXERCISE_TYPE.CARDIO,
    );
    expect(toggleSingleSelect(EXERCISE_TYPE.CARDIO, EXERCISE_TYPE.CARDIO)).toBeNull();
  });

  it('combines type and source groups independently', () => {
    const strengthOnly = filterExercises(fixtures, '', EXERCISE_TYPE.STRENGTH, null);
    expect(strengthOnly.map((x) => x.id)).toEqual(['ex-1', 'ex-2']);

    const curatedOnly = filterExercises(fixtures, '', null, 'curated');
    expect(curatedOnly.map((x) => x.id)).toEqual(['ex-1', 'ex-3']);

    const strengthCurated = filterExercises(fixtures, '', EXERCISE_TYPE.STRENGTH, 'curated');
    expect(strengthCurated.map((x) => x.id)).toEqual(['ex-1']);

    const cardioCustom = filterExercises(fixtures, '', EXERCISE_TYPE.CARDIO, 'custom');
    expect(cardioCustom.map((x) => x.id)).toEqual(['ex-4']);
  });

  it('applies query with chips', () => {
    const result = filterExercises(fixtures, 'bike', EXERCISE_TYPE.CARDIO, 'custom');
    expect(result.map((x) => x.id)).toEqual(['ex-4']);
  });

  it('keeps empty query ordering while applying filters', () => {
    const result = filterExercises(searchFixtures, '', null, null);
    expect(result.map((x) => x.id)).toEqual(searchFixtures.map((x) => x.id));
  });

  it('sorts favorites first for empty query while preserving order inside groups', () => {
    const rows = [
      exercise({ id: 'ex-a', name: 'A' }),
      { ...exercise({ id: 'ex-b', name: 'B' }), is_favorite: 1 },
      exercise({ id: 'ex-c', name: 'C' }),
      { ...exercise({ id: 'ex-d', name: 'D' }), is_favorite: 1 },
    ];

    expect(filterExercises(rows, '', null, null).map((x) => x.id)).toEqual([
      'ex-b',
      'ex-d',
      'ex-a',
      'ex-c',
    ]);
  });

  it('promotes favorites only within equal search scores', () => {
    const rows = [
      {
        ...exercise({ id: 'ex-custom-exact', name: 'Garage Press', isCustom: true }),
        is_favorite: 0,
      },
      { ...exercise({ id: 'ex-favorite-prefix', name: 'Garage Press Machine' }), is_favorite: 1 },
      { ...exercise({ id: 'ex-favorite-exact', name: 'Garage Press' }), is_favorite: 1 },
    ];

    expect(filterExercises(rows, 'garage press', null, null).map((x) => x.id)).toEqual([
      'ex-favorite-exact',
      'ex-custom-exact',
      'ex-favorite-prefix',
    ]);
  });

  it('finds overhead press entries by OHP alias', () => {
    const result = filterExercises(searchFixtures, 'OHP', null, null).map((x) => x.id);
    expect(result).toContain('ex_overhead_press_barbell');
    expect(result).toContain('ex_military_press');
  });

  it('finds Romanian deadlift variants by RDL alias', () => {
    const result = filterExercises(searchFixtures, 'RDL', null, null).map((x) => x.id);
    expect(result).toEqual([
      'ex_bb_rdl',
      'ex_romanian_deadlift_dumbbell',
      'ex_hack_squat_machine_rdl',
    ]);
  });

  it('matches compact and spaced pull-up queries', () => {
    expect(filterExercises(searchFixtures, 'pullup', null, null).map((x) => x.id)).toContain(
      'ex_pullup',
    );
    expect(filterExercises(searchFixtures, 'pull up', null, null).map((x) => x.id)).toContain(
      'ex_pullup',
    );
  });

  it('ranks close-grip cable row above broader row results for any-order tokens', () => {
    const result = filterExercises(searchFixtures, 'cable row close', null, null).map((x) => x.id);
    expect(result[0]).toBe('ex_close_grip_cable_row');
    expect(result).toContain('ex_seated_cable_row');
  });

  it('finds dumbbell shoulder press with any-order words and abbreviation expansion', () => {
    expect(filterExercises(searchFixtures, 'shoulder dumbbell press', null, null)[0]?.id).toBe(
      'ex_dumbbell_shoulder_press',
    );
    expect(filterExercises(searchFixtures, 'db press', null, null).map((x) => x.id)).toContain(
      'ex_dumbbell_shoulder_press',
    );
  });

  it('finds triceps pushdown entries with singular, plural, and rope aliases', () => {
    expect(filterExercises(searchFixtures, 'tricep pushdown', null, null).map((x) => x.id)).toEqual(
      ['ex_cable_tricep_pushdown', 'ex_triceps_pushdown', 'ex_rope_triceps_pushdown'],
    );
    expect(
      filterExercises(searchFixtures, 'triceps pushdown', null, null).map((x) => x.id),
    ).toEqual(['ex_triceps_pushdown', 'ex_cable_tricep_pushdown', 'ex_rope_triceps_pushdown']);
    expect(filterExercises(searchFixtures, 'rope pushdown', null, null)[0]?.id).toBe(
      'ex_rope_triceps_pushdown',
    );
  });

  it('finds lat pulldown with separated pull down query', () => {
    expect(filterExercises(searchFixtures, 'lat pull down', null, null)[0]?.id).toBe(
      'ex_lat_pulldown',
    );
  });

  it('finds machine chest candidates via any-order tokens', () => {
    const result = filterExercises(searchFixtures, 'machine chest', null, null).map((x) => x.id);
    expect(result[0]).toBe('ex_machine_chest_press');
    expect(result).toEqual(
      expect.arrayContaining(['ex_machine_chest_press', 'ex_chest_fly_machine', 'ex_pec_deck']),
    );
  });

  it('finds canonical machine chest press by canonical and deprecated phrases', () => {
    const selectableRows = searchFixtures.filter(
      (exercise) => exercise.id !== 'ex_chest_press_machine',
    );

    expect(filterExercises(selectableRows, 'Machine Chest Press', null, null)[0]?.id).toBe(
      'ex_machine_chest_press',
    );
    expect(filterExercises(selectableRows, 'Chest Press Machine', null, null)[0]?.id).toBe(
      'ex_machine_chest_press',
    );
    expect(
      filterExercises(selectableRows, 'Chest Press Machine', null, null).map((x) => x.id),
    ).not.toContain('ex_chest_press_machine');
  });

  it('finds canonical machine shoulder press by canonical and deprecated phrases', () => {
    const selectableRows = searchFixtures.filter(
      (exercise) => exercise.id !== 'ex_shoulder_press_machine',
    );

    expect(filterExercises(selectableRows, 'Machine Shoulder Press', null, null)[0]?.id).toBe(
      'ex_machine_shoulder_press',
    );
    expect(filterExercises(selectableRows, 'Shoulder Press Machine', null, null)[0]?.id).toBe(
      'ex_machine_shoulder_press',
    );
    expect(
      filterExercises(selectableRows, 'Shoulder Press Machine', null, null).map((x) => x.id),
    ).not.toContain('ex_shoulder_press_machine');
  });

  it('matches custom exercise names and prioritizes custom exercises on same-score ties', () => {
    const rows = [
      exercise({ id: 'ex_curated_garage_press', name: 'Garage DB Press' }),
      exercise({ id: 'ex_custom_garage_press', name: 'Garage DB Press', isCustom: true }),
    ];

    const result = filterExercises(rows, 'garage db press', null, null).map((x) => x.id);
    expect(result).toEqual(['ex_custom_garage_press', 'ex_curated_garage_press']);
  });

  it('keeps cardio filters working with ranked search', () => {
    const result = filterExercises(searchFixtures, 'bike', EXERCISE_TYPE.CARDIO, null);
    expect(result.map((x) => x.id)).toEqual(['ex_custom_bike']);

    const strengthResult = filterExercises(searchFixtures, 'bike', EXERCISE_TYPE.STRENGTH, null);
    expect(strengthResult).toEqual([]);
  });

  it('keeps source filters working with ranked search', () => {
    expect(filterExercises(searchFixtures, 'press', null, 'custom').map((x) => x.id)).toEqual([
      'ex_custom_db_press',
    ]);
    expect(
      filterExercises(searchFixtures, 'press', null, 'curated').map((x) => x.id),
    ).not.toContain('ex_custom_db_press');
  });

  it('returns each exercise at most once', () => {
    const result = filterExercises(searchFixtures, 'pec deck', null, null).map((x) => x.id);
    expect(new Set(result).size).toBe(result.length);
  });
});
