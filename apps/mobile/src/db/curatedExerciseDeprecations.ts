export const DEPRECATED_CURATED_EXERCISE_CANONICAL_IDS: Record<string, string> = {
  ex_chest_press_machine: 'ex_machine_chest_press',
  ex_shoulder_press_machine: 'ex_machine_shoulder_press',
};

export const DEPRECATED_CURATED_EXERCISE_IDS = new Set(
  Object.keys(DEPRECATED_CURATED_EXERCISE_CANONICAL_IDS),
);
