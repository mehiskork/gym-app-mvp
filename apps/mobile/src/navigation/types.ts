export type RootStackParamList = {
  MainTabs: undefined;

  StartWorkout: undefined;
  WorkoutSession: { sessionId: string };

  CreateExercise: undefined;

  WorkoutPlanDetail: { workoutPlanId: string };
  DayDetail: { dayId: string };
  ExercisePicker: { dayId: string };
};

export type TabParamList = {
  Today: undefined;
  WorkoutPlans: undefined;
  History: undefined;
  Settings: undefined;
};
