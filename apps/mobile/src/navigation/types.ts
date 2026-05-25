import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Home: undefined;
  WorkoutPlans: undefined;
  History: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList>;

  StartWorkout: undefined;
  WorkoutSession: { sessionId: string };

  SessionDetail: { sessionId: string; postFinish?: boolean };

  ExerciseDetail: { exerciseId: string };

  CreateExercise: undefined;

  WorkoutPlanDetail: { workoutPlanId: string; mode?: 'edit' | 'pickSessionToStart' };
  PrebuiltPlans: undefined;
  PrebuiltPlanPreview: { templateId: string };
  DayDetail: {
    dayId: string;
    refreshKey?: number;
    addedExerciseId?: string;
    workoutPlanId?: string;
    mode?: 'edit' | 'startSession';
  };

  ExercisePicker:
    | {
        dayId?: string;
        swapSessionExerciseId?: string;
        swapSessionId?: string;
        addToSessionId?: string;
      }
    | undefined;

  ClaimStart: undefined;

  Debug: undefined;
};
