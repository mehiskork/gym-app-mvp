import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';
import { enqueueOutboxOp } from './outboxRepo';
import prebuiltJson from './seed/prebuilt_plans.json';

type PrebuiltPlanSet = {
  reps: number;
  rest_seconds?: number | null;
};

type PrebuiltPlanExercise = {
  exercise_id: string;
  sets?: PrebuiltPlanSet[];
};

type PrebuiltPlanDay = {
  name?: string | null;
  exercises: PrebuiltPlanExercise[];
};

type PrebuiltPlanTemplate = {
  id: string;
  name: string;
  description?: string | null;
  days: PrebuiltPlanDay[];
};

export type PrebuiltPlanListItem = {
  id: string;
  name: string;
  description: string | null;
  dayCount: number;
  existingPlanId: string | null;
};

const templates = prebuiltJson as PrebuiltPlanTemplate[];

function enqueueEntitySnapshot(
  entityType: 'program' | 'program_week' | 'program_day' | 'program_day_exercise' | 'planned_set',
  entityId: string,
  opType: 'upsert' | 'delete' = 'upsert',
) {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM ${entityType}
    WHERE id = ?
    LIMIT 1;
  `,
    [entityId],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType,
    entityId,
    opType,
    payloadJson: JSON.stringify(row),
  });
}

function buildPlanKey(name: string, description: string | null) {
  return `${name}__${description ?? ''}`;
}

export function listPrebuiltPlans(): PrebuiltPlanListItem[] {
  const existingPlans = query<{ id: string; name: string; description: string | null }>(
    `
    SELECT id, name, description
    FROM program
    WHERE deleted_at IS NULL;
  `,
  );

  const existingByKey = new Map<string, string>();
  for (const plan of existingPlans) {
    existingByKey.set(buildPlanKey(plan.name, plan.description ?? null), plan.id);
  }

  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description ?? null,
    dayCount: template.days.length,
    existingPlanId:
      existingByKey.get(buildPlanKey(template.name, template.description ?? null)) ?? null,
  }));
}

function getTemplate(templateId: string): PrebuiltPlanTemplate {
  const template = templates.find((entry) => entry.id === templateId);
  if (!template) throw new Error(`Prebuilt plan not found: ${templateId}`);
  return template;
}

function assertExercisesExist(template: PrebuiltPlanTemplate) {
  const ids = new Set<string>();
  template.days.forEach((day) => {
    day.exercises.forEach((exercise) => {
      ids.add(exercise.exercise_id);
    });
  });

  const uniqueIds = Array.from(ids);
  if (uniqueIds.length === 0) return;

  const placeholders = uniqueIds.map(() => '?').join(', ');
  const existing = query<{ id: string }>(
    `
    SELECT id
    FROM exercise
    WHERE id IN (${placeholders}) AND deleted_at IS NULL;
  `,
    uniqueIds,
  ).map((row) => row.id);

  const existingSet = new Set(existing);
  const missing = uniqueIds.filter((id) => !existingSet.has(id));

  if (missing.length > 0) {
    throw new Error(
      `Prebuilt plan "${template.name}" references missing exercise IDs: ${missing.join(', ')}`,
    );
  }
}

export function importPrebuiltPlan(templateId: string): string {
  const template = getTemplate(templateId);

  return inTransaction(() => {
    assertExercisesExist(template);

    const existing = query<{ id: string }>(
      `
      SELECT id
      FROM program
      WHERE name = ? AND description IS ? AND deleted_at IS NULL
      LIMIT 1;
    `,
      [template.name, template.description ?? null],
    )[0];

    if (existing?.id) {
      throw new Error(`Prebuilt plan already added: ${template.name}`);
    }

    const programId = newId('program');
    exec(
      `
      INSERT INTO program (id, name, description, is_template)
      VALUES (?, ?, ?, 0);
    `,
      [programId, template.name, template.description ?? null],
    );

    const weekId = newId('week');
    exec(
      `
      INSERT INTO program_week (id, program_id, week_index)
      VALUES (?, ?, 1);
    `,
      [weekId, programId],
    );

    const dayIds: string[] = [];
    const dayExerciseIds: string[] = [];
    const plannedSetIds: string[] = [];

    template.days.forEach((day, dayIndex) => {
      const dayId = newId('day');
      dayIds.push(dayId);
      exec(
        `
        INSERT INTO program_day (id, program_week_id, day_index, name)
        VALUES (?, ?, ?, ?);
      `,
        [dayId, weekId, dayIndex + 1, day.name ?? `Day ${dayIndex + 1}`],
      );

      day.exercises.forEach((exercise, exerciseIndex) => {
        const dayExerciseId = newId('pde');
        dayExerciseIds.push(dayExerciseId);
        exec(
          `
          INSERT INTO program_day_exercise (id, program_day_id, exercise_id, position, notes)
          VALUES (?, ?, ?, ?, NULL);
        `,
          [dayExerciseId, dayId, exercise.exercise_id, exerciseIndex + 1],
        );

        const sets = exercise.sets ?? [];
        sets.forEach((set, setIndex) => {
          const plannedSetId = newId('pset');
          plannedSetIds.push(plannedSetId);
          exec(
            `
            INSERT INTO planned_set (
              id,
              program_day_exercise_id,
              set_index,
              target_reps_min,
              target_reps_max,
              rest_seconds
            ) VALUES (?, ?, ?, ?, ?, ?);
          `,
            [
              plannedSetId,
              dayExerciseId,
              setIndex + 1,
              set.reps,
              set.reps,
              set.rest_seconds ?? null,
            ],
          );
        });
      });
    });

    enqueueEntitySnapshot('program', programId);
    enqueueEntitySnapshot('program_week', weekId);
    for (const dayId of dayIds) {
      enqueueEntitySnapshot('program_day', dayId);
    }
    for (const dayExerciseId of dayExerciseIds) {
      enqueueEntitySnapshot('program_day_exercise', dayExerciseId);
    }
    for (const plannedSetId of plannedSetIds) {
      enqueueEntitySnapshot('planned_set', plannedSetId);
    }

    return programId;
  });
}
