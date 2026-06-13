import React, { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { Button, Card, DestructiveConfirmDialog, Screen, Snackbar, Text } from '../ui';
import { tokens } from '../theme/tokens';
import { TAB_ROUTES } from '../navigation/routes';
import type { RootStackParamList } from '../navigation/types';
import { discardSession, getInProgressSession } from '../db/workoutSessionRepo';
import { listWorkoutPlans } from '../db/workoutPlanRepo';
import { getThisWeekSummary } from '../db/weeklyRepo';
import { listRecentSessionSummaries } from '../db/historyRepo';
import { TodayPrimaryAction } from '../features/today/TodayPrimaryAction';
import { TodayRecentActivity } from '../features/today/TodayRecentActivity';
import { TodayWeeklyStats } from '../features/today/TodayWeeklyStats';
import { createGoogleAccountFromGuest } from '../auth/googleAccountOrchestrator';
import { resolveLocalAccountState, type LocalAccountStateStatus } from '../auth/localAccountState';
import { hasPendingAccountDeletionRecovery } from '../auth/accountDeletion';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function getFriendlyGuestSignInError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('cancel')) {
    return 'Google sign-in did not finish. Try again.';
  }

  if (message.includes('network') || message.includes('offline') || message.includes('timeout')) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  return "Couldn't finish Google sign-in. Check your connection and try again.";
}

export function TodayScreen() {
  const navigation = useNavigation<Nav>();
  const [inProgressId, setInProgressId] = useState<string | null>(null);
  const [inProgressTitle, setInProgressTitle] = useState<string | null>(null);
  const [hasPlans, setHasPlans] = useState(false);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState(0);
  const [weeklyVolume, setWeeklyVolume] = useState(0);
  const [recentSessions, setRecentSessions] = useState(listRecentSessionSummaries(3));
  const [localAccountStatus, setLocalAccountStatus] = useState<LocalAccountStateStatus | null>(
    null,
  );
  const [accountSignInBusy, setAccountSignInBusy] = useState(false);
  const [accountPromptError, setAccountPromptError] = useState<string | null>(null);
  const [quickStartError, setQuickStartError] = useState<string | null>(null);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [discardBusy, setDiscardBusy] = useState(false);
  const [accountDeletionRecoveryActive, setAccountDeletionRecoveryActive] = useState(false);
  const accountSignInInFlightRef = useRef(false);
  const discardInFlightRef = useRef(false);

  const load = useCallback(() => {
    const s = getInProgressSession();
    setInProgressId(s?.id ?? null);
    setInProgressTitle(s?.title ?? null);
    setHasPlans(listWorkoutPlans().length > 0);
    const week = getThisWeekSummary();
    setWeeklyWorkouts(week.workouts);
    setWeeklyVolume(week.total_kg);
    setRecentSessions(listRecentSessionSummaries(3));
  }, []);

  const refreshAccountPromptState = useCallback(async () => {
    const [state, deletionRecoveryActive] = await Promise.all([
      resolveLocalAccountState(),
      hasPendingAccountDeletionRecovery(),
    ]);
    setLocalAccountStatus(state.status);
    setAccountDeletionRecoveryActive(deletionRecoveryActive);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load();
      void refreshAccountPromptState().catch(() => {
        if (!active) return;
        setLocalAccountStatus(null);
        setAccountDeletionRecoveryActive(true);
      });
      return () => {
        active = false;
      };
    }, [load, refreshAccountPromptState]),
  );

  const handleGuestSignIn = useCallback(() => {
    if (accountSignInBusy || accountSignInInFlightRef.current) return;

    accountSignInInFlightRef.current = true;
    setAccountSignInBusy(true);
    setAccountPromptError(null);
    void (async () => {
      try {
        await createGoogleAccountFromGuest();
        await refreshAccountPromptState();
      } catch (error) {
        setAccountPromptError(getFriendlyGuestSignInError(error));
      } finally {
        accountSignInInFlightRef.current = false;
        setAccountSignInBusy(false);
      }
    })();
  }, [accountSignInBusy, refreshAccountPromptState]);

  const handleQuickStart = useCallback(() => {
    setQuickStartError(null);
    const existingSession = getInProgressSession();
    if (existingSession) {
      navigation.navigate('WorkoutSession', { sessionId: existingSession.id });
      return;
    }

    navigation.navigate('QuickWorkoutDraft');
  }, [navigation]);

  const handleOpenDiscardConfirm = useCallback(() => {
    if (discardInFlightRef.current) return;
    setDiscardError(null);
    setDiscardConfirmOpen(true);
  }, []);

  const handleCloseDiscardConfirm = useCallback(() => {
    if (discardInFlightRef.current) return;
    setDiscardConfirmOpen(false);
  }, []);

  const handleConfirmDiscard = useCallback(() => {
    if (discardBusy || discardInFlightRef.current) return;

    discardInFlightRef.current = true;
    setDiscardBusy(true);
    setDiscardError(null);

    try {
      const currentActiveSession = getInProgressSession();
      if (!currentActiveSession) {
        setDiscardConfirmOpen(false);
        load();
        return;
      }

      discardSession(currentActiveSession.id);
      setDiscardConfirmOpen(false);
      load();
    } catch {
      setDiscardError("Couldn't discard active workout. Try again.");
      load();
    } finally {
      discardInFlightRef.current = false;
      setDiscardBusy(false);
    }
  }, [discardBusy, load]);

  const hasMeaningfulLocalData =
    Boolean(inProgressId) || weeklyWorkouts > 0 || recentSessions.length > 0;
  const showGuestProtectionCard =
    localAccountStatus === 'guest' &&
    hasMeaningfulLocalData &&
    !accountSignInBusy &&
    !accountDeletionRecoveryActive;

  return (
    <Screen scroll padded={false} bottomInset="tabBar">
      <View
        style={{
          paddingHorizontal: tokens.spacing.lg,
          paddingTop: tokens.spacing.md,
          gap: tokens.spacing.lg,
        }}
      >
        <TodayPrimaryAction
          hasActiveWorkout={Boolean(inProgressId)}
          activeWorkoutTitle={inProgressTitle ?? undefined}
          onResume={
            inProgressId
              ? () => navigation.navigate('WorkoutSession', { sessionId: inProgressId })
              : undefined
          }
          onDiscardActiveWorkout={inProgressId ? handleOpenDiscardConfirm : undefined}
          hasPlans={hasPlans}
          onStart={() =>
            hasPlans
              ? navigation.navigate('StartWorkout')
              : navigation.navigate('MainTabs', { screen: TAB_ROUTES.WorkoutPlans })
          }
          onQuickStart={handleQuickStart}
        />
        <TodayWeeklyStats workouts={weeklyWorkouts} totalKg={weeklyVolume} />
        <TodayRecentActivity
          sessions={recentSessions.map((session) => ({
            id: session.id,
            title: session.title,
            startedAt: session.started_at,
            endedAt: session.ended_at,
            volume: session.volume,
            prs: session.prs,
          }))}
          onViewAll={() => navigation.navigate('MainTabs', { screen: TAB_ROUTES.History })}
          onOpenSession={(sessionId) => navigation.navigate('SessionDetail', { sessionId })}
        />
        {showGuestProtectionCard ? (
          <Card>
            <View style={{ gap: tokens.spacing.sm }}>
              <Text variant="subtitle">Protect your progress</Text>
              <Text variant="muted">
                Sign in with Google to sync your workout data and keep it safe if you change phones.
              </Text>
              <Button
                title="Sign in with Google"
                onPress={handleGuestSignIn}
                loading={accountSignInBusy}
                disabled={accountSignInBusy}
              />
            </View>
          </Card>
        ) : null}
        {accountPromptError ? (
          <Snackbar visible message={accountPromptError} variant="error" minHeight={44} />
        ) : null}
        {quickStartError ? (
          <Snackbar visible message={quickStartError} variant="error" minHeight={44} />
        ) : null}
        {discardError ? (
          <Snackbar visible message={discardError} variant="error" minHeight={44} />
        ) : null}
      </View>
      <DestructiveConfirmDialog
        visible={discardConfirmOpen}
        title="Discard active workout?"
        body="This workout will not be saved to History."
        cancelLabel="Cancel"
        confirmLabel="Discard"
        onClose={handleCloseDiscardConfirm}
        onConfirm={handleConfirmDiscard}
        confirmLoading={discardBusy}
        confirmDisabled={discardBusy}
        cancelDisabled={discardBusy}
      />
    </Screen>
  );
}
