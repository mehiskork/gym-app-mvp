import curatedExercisesJson from '../seed/curated_exercises.json';
import prebuiltPlansJson from '../seed/prebuilt_plans.json';
import { CARDIO_PROFILE, EXERCISE_TYPE } from '../exerciseTypes';

type CuratedExerciseSeed = {
  id: string;
  name: string;
  exercise_type?: string;
  cardio_profile?: string;
};

type PrebuiltPlanSeed = {
  days: Array<{
    exercises: Array<{
      exercise_id: string;
    }>;
  }>;
};

const curatedExercises = curatedExercisesJson as CuratedExerciseSeed[];
const prebuiltPlans = prebuiltPlansJson as PrebuiltPlanSeed[];

const highValueExerciseIds = [
  'ex_dumbbell_shoulder_press',
  'ex_assisted_pullup',
  'ex_smith_machine_squat',
  'ex_back_extension',
  'ex_cable_lateral_raise',
  'ex_cable_bicep_curl',
  'ex_ez_bar_curl',
  'ex_rope_triceps_pushdown',
  'ex_leg_curl_seated',
  'ex_machine_shoulder_press',
  'ex_cable_crunch',
  'ex_assisted_dip',
  'ex_chest_supported_row',
  'ex_leg_press_calf_raise',
  'ex_glute_kickback_machine',
  'ex_smith_machine_bench_press',
  'ex_preacher_curl',
  'ex_reverse_pec_deck',
  'ex_machine_chest_press',
  'ex_hip_abduction_machine',
];

const deprecatedCuratedExerciseIds = ['ex_chest_press_machine', 'ex_shoulder_press_machine'];

function duplicates(values: string[]) {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      repeated.add(value);
    } else {
      seen.add(value);
    }
  }

  return Array.from(repeated).sort();
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

describe('seed integrity', () => {
  it('does not include duplicate curated exercise IDs', () => {
    expect(duplicates(curatedExercises.map((exercise) => exercise.id))).toEqual([]);
  });

  it('does not include duplicate normalized curated exercise names', () => {
    expect(duplicates(curatedExercises.map((exercise) => normalizeName(exercise.name)))).toEqual(
      [],
    );
  });

  it('only references existing curated exercises from prebuilt plans', () => {
    const curatedIds = new Set(curatedExercises.map((exercise) => exercise.id));
    const referencedIds = prebuiltPlans.flatMap((plan) =>
      plan.days.flatMap((day) => day.exercises.map((exercise) => exercise.exercise_id)),
    );

    expect(referencedIds.filter((id) => !curatedIds.has(id))).toEqual([]);
  });

  it('keeps deprecated seeded exercise IDs present but out of prebuilt plans', () => {
    const curatedIds = new Set(curatedExercises.map((exercise) => exercise.id));
    const referencedIds = prebuiltPlans.flatMap((plan) =>
      plan.days.flatMap((day) => day.exercises.map((exercise) => exercise.exercise_id)),
    );

    expect(deprecatedCuratedExerciseIds.filter((id) => !curatedIds.has(id))).toEqual([]);
    expect(referencedIds.filter((id) => deprecatedCuratedExerciseIds.includes(id))).toEqual([]);
  });

  it('uses valid cardio profiles only for cardio exercises', () => {
    const validProfiles = new Set<string>(Object.values(CARDIO_PROFILE));

    for (const exercise of curatedExercises) {
      if (exercise.exercise_type === EXERCISE_TYPE.CARDIO) {
        expect(validProfiles.has(exercise.cardio_profile ?? '')).toBe(true);
      } else {
        expect(exercise.cardio_profile).toBeUndefined();
      }
    }
  });

  it('includes the high-value MVP exercise additions as strength exercises', () => {
    const exercisesById = new Map(curatedExercises.map((exercise) => [exercise.id, exercise]));

    for (const id of highValueExerciseIds) {
      expect(exercisesById.has(id)).toBe(true);
      expect(exercisesById.get(id)?.exercise_type ?? EXERCISE_TYPE.STRENGTH).toBe(
        EXERCISE_TYPE.STRENGTH,
      );
    }
  });
});
