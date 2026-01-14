export type RootStackParamList = {
  MainTabs: undefined;
  WorkoutSession: { sessionId: string };
  CreateExercise: undefined;
  WorkoutPlanDetail: { workoutPlanId: string };
};

export type TabParamList = {
  Today: undefined;
  WorkoutPlans: undefined;
  History: undefined;
  Settings: undefined;
};
