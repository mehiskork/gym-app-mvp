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

  WorkoutPlanDetail: { workoutPlanId: string; mode?: 'edit' | 'pickDayToStart' };
  PrebuiltPlans: undefined;
  DayDetail: {
    dayId: string;
    refreshKey?: number;
    addedExerciseId?: string;
    workoutPlanId?: string;
    mode?: 'edit' | 'startSession';
  };

  ExercisePicker: { dayId?: string } | undefined;

  ClaimStart: undefined;
  ClaimConfirm: undefined;


  Debug: undefined;
};
