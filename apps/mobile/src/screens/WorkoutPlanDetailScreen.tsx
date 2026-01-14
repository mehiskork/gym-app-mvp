import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';
import {
  addDayToWorkoutPlan,
  getWorkoutPlanById,
  listDaysForWorkoutPlan,
  reorderWorkoutPlanDays,
  type WorkoutPlanDayRow,
} from '../db/workoutPlanRepo';
import { deleteDay } from '../db/dayExerciseRepo';
import { getBool, setBool } from '../utils/prefs';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutPlanDetail'>;

const PREF_HIDE_DAY_TAP_HINT = 'prefs.hide_day_tap_hint.v1';

export function WorkoutPlanDetailScreen({ route, navigation }: Props) {
  const { workoutPlanId } = route.params;

  const [planName, setPlanName] = useState<string | null>(null);
  const [days, setDays] = useState<WorkoutPlanDayRow[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [showTapHint, setShowTapHint] = useState(true);

  useEffect(() => {
    (async () => {
      const hide = await getBool(PREF_HIDE_DAY_TAP_HINT, false);
      setShowTapHint(!hide);
    })();
  }, []);

  const load = useCallback(() => {
    const plan = getWorkoutPlanById(workoutPlanId);
    setPlanName(plan?.name ?? null);

    if (!plan) {
      setDays([]);
      setIsLoaded(true);
      return;
    }

    setDays(listDaysForWorkoutPlan(workoutPlanId));
    setIsLoaded(true);
  }, [workoutPlanId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      if (planName) navigation.setOptions({ title: planName });
    }, [navigation, planName]),
  );

  const onTapDay = useCallback(
    async (dayId: string) => {
      if (showTapHint) {
        setShowTapHint(false);
        await setBool(PREF_HIDE_DAY_TAP_HINT, true);
      }
      navigation.navigate('DayDetail', { dayId });
    },
    [navigation, showTapHint],
  );

  const confirmDeleteDay = useCallback(
    (day: WorkoutPlanDayRow) => {
      const label = day.name ?? `Day ${day.day_index}`;
      Alert.alert('Delete day?', `"${label}" will be removed from this plan.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteDay(day.id);
            load();
          },
        },
      ]);
    },
    [load],
  );

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<WorkoutPlanDayRow>) => {
      const label = item.name ?? `Day ${item.day_index}`;

      return (
        <View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: tokens.spacing.sm,
              padding: tokens.spacing.md,
              backgroundColor: tokens.colors.surface,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
            },
            isActive
              ? {
                  elevation: 6,
                  shadowColor: '#000',
                  shadowOpacity: 0.18,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 6 },
                  opacity: 0.98,
                }
              : null,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={() => void onTapDay(item.id)}>
            <AppText variant="subtitle">{label}</AppText>
            {showTapHint ? (
              <AppText color="textSecondary">Tap to edit exercises and rename</AppText>
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => confirmDeleteDay(item)}
            style={({ pressed }) => [
              {
                minHeight: tokens.touchTargetMin,
                minWidth: tokens.touchTargetMin,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: tokens.radius.sm,
                borderWidth: 1,
                borderColor: tokens.colors.border,
              },
              pressed ? { opacity: 0.85 } : null,
            ]}
            accessibilityLabel="Delete day"
          >
            <Ionicons name="trash-outline" size={20} color={tokens.colors.textSecondary} />
          </Pressable>

          <Pressable
            onLongPress={drag}
            delayLongPress={150}
            style={({ pressed }) => [
              {
                minHeight: tokens.touchTargetMin,
                minWidth: tokens.touchTargetMin,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: tokens.radius.sm,
                borderWidth: 1,
                borderColor: tokens.colors.border,
              },
              pressed ? { opacity: 0.85 } : null,
            ]}
            accessibilityLabel="Reorder day"
          >
            <AppText color="textSecondary">≡</AppText>
          </Pressable>
        </View>
      );
    },
    [confirmDeleteDay, onTapDay, showTapHint],
  );

  if (!isLoaded) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <AppText variant="title">Loading…</AppText>
      </Screen>
    );
  }

  if (!planName) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <AppText variant="title">Not found</AppText>
        <AppText color="textSecondary">This workout plan no longer exists.</AppText>
      </Screen>
    );
  }

  return (
    <Screen style={{ gap: tokens.spacing.lg }}>
      <View style={{ gap: tokens.spacing.sm }}>
        <AppText variant="title">{planName}</AppText>

        <PrimaryButton
          title="Add day"
          onPress={() => {
            addDayToWorkoutPlan(workoutPlanId);
            load();
          }}
        />

        <AppText color="textSecondary">Hold ≡ and drag to reorder days.</AppText>
      </View>

      <DraggableFlatList
        data={days}
        keyExtractor={(d) => d.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
        ListEmptyComponent={<AppText color="textSecondary">No days yet. Tap “Add day”.</AppText>}
        onDragBegin={() => {
          void Haptics.selectionAsync();
        }}
        onDragEnd={({ data }) => {
          setDays(data);
          reorderWorkoutPlanDays(
            workoutPlanId,
            data.map((d) => d.id),
          );
          load();
        }}
      />
    </Screen>
  );
}
