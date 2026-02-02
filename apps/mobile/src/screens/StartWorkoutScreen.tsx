import React, { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';


import type { RootStackParamList } from '../navigation/types';
import { Screen, Card, EmptyState, Button, ListRow, IconChip } from '../ui';
import { tokens } from '../theme/tokens';
import { listWorkoutPlans, type WorkoutPlanRow } from '../db/workoutPlanRepo';


type Props = NativeStackScreenProps<RootStackParamList, 'StartWorkout'>;

export function StartWorkoutScreen({ navigation }: Props) {
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
      bottomInset="none"
      contentStyle={{

      }}
    >


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
        <FlatList
          data={plans}
          keyExtractor={(plan) => plan.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle="Choose a day"
              showChevron
              left={
                <IconChip variant="muted" size={40}>
                  <Ionicons name="barbell-outline" size={18} color={tokens.colors.mutedText} />
                </IconChip>
              }
              onPress={() =>
                navigation.navigate('WorkoutPlanDetail', {
                  workoutPlanId: item.id,
                  mode: 'pickDayToStart',
                })
              }
            />
          )}
        />
      )
      }
    </Screen >
  );
}
