import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Today: undefined;
  WorkoutPlans: undefined;
  History: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList>;

  StartWorkout: undefined;
  WorkoutSession: { sessionId: string };

  SessionDetail: { sessionId: string };

  ExerciseDetail: { exerciseId: string };

  CreateExercise: undefined;

  WorkoutPlanDetail: { workoutPlanId: string };
  DayDetail: { dayId: string; refreshKey?: number };
  ExercisePicker: { dayId: string };
};
