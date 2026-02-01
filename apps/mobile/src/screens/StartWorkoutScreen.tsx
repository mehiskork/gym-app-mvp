import React, { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../navigation/types';
import { Screen, Header, Card, EmptyState, Button, SectionHeader, ListRow, IconChip } from '../ui';
import { tokens } from '../theme/tokens';
import { listWorkoutPlans, type WorkoutPlanRow } from '../db/workoutPlanRepo';


type Props = NativeStackScreenProps<RootStackParamList, 'StartWorkout'>;

export function StartWorkoutScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<WorkoutPlanRow[]>([]);


  const load = useCallback(() => {
    setPlans(listWorkoutPlans());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );


  return (
    <Screen
      scroll
      contentStyle={{
        gap: tokens.spacing.lg,
        paddingBottom: tokens.spacing.lg + insets.bottom + tokens.layout.tabBarHeight,
      }}
    >
      <Header title="Start Workout" subtitle="Select a plan and day" />

      {plans.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Ionicons name="barbell-outline" size={24} color={tokens.colors.mutedText} />}
            title="No plans yet"
            description="Create your first plan or browse templates to get started."
            action={
              <View style={{ gap: tokens.spacing.sm, alignSelf: 'stretch' }}>
                <Button
                  title="Create a plan"
                  variant="secondary"
                  onPress={() => navigation.navigate('MainTabs', { screen: 'WorkoutPlans' })}
                />
                <Button
                  title="Browse templates"
                  onPress={() => navigation.navigate('PrebuiltPlans')}
                />
              </View>
            }
          />
        </Card>
      ) : (
        <View style={{ gap: tokens.spacing.sm }}>
          <SectionHeader title="Your Plans" />
          <FlatList
            data={plans}
            keyExtractor={(plan) => plan.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
            renderItem={({ item }) => (
              <ListRow
                title={item.name}
                subtitle="Tap to open"
                showChevron
                left={
                  <IconChip variant="muted" size={40}>
                    <Ionicons name="barbell-outline" size={18} color={tokens.colors.mutedText} />
                  </IconChip>
                }
                onPress={() =>
                  navigation.navigate('WorkoutPlanDetail', { workoutPlanId: item.id })
                }
              />
            )}
          />
        </View>
      )
      }
    </Screen >
  );
}
