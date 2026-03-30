import { filterExercises, toggleSingleSelect } from '../exercisePickerFilters';
import { EXERCISE_TYPE } from '../../db/exerciseTypes';
import type { ExerciseRow } from '../../db/exerciseRepo';

const fixtures: ExerciseRow[] = [
  {
    id: 'ex-1',
    name: 'Bench Press',
    normalized_name: 'bench press',
    is_custom: 0,
    owner_user_id: null,
    exercise_type: EXERCISE_TYPE.STRENGTH,
    cardio_profile: null,
  },
  {
    id: 'ex-2',
    name: 'Custom Push Up',
    normalized_name: 'custom push up',
    is_custom: 1,
    owner_user_id: 'u1',
    exercise_type: EXERCISE_TYPE.STRENGTH,
    cardio_profile: null,
  },
  {
    id: 'ex-3',
    name: 'Run',
    normalized_name: 'run',
    is_custom: 0,
    owner_user_id: null,
    exercise_type: EXERCISE_TYPE.CARDIO,
    cardio_profile: 'treadmill',
  },
  {
    id: 'ex-4',
    name: 'Custom Bike',
    normalized_name: 'custom bike',
    is_custom: 1,
    owner_user_id: 'u1',
    exercise_type: EXERCISE_TYPE.CARDIO,
    cardio_profile: 'bike',
  },
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
});
