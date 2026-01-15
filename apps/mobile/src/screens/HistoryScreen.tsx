import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { tokens } from '../theme/tokens';
import { listCompletedSessions, type CompletedSessionRow } from '../db/historyRepo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

export function HistoryScreen() {
  const navigation = useNavigation<Nav>();
  const [sessions, setSessions] = useState<CompletedSessionRow[]>([]);

  const load = useCallback(() => {
    setSessions(listCompletedSessions(50));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen style={{ gap: tokens.spacing.lg }}>
      <AppText variant="title">History</AppText>

      {sessions.length === 0 ? (
        <AppText color="textSecondary">No completed workouts yet.</AppText>
      ) : (
        <View style={{ gap: tokens.spacing.sm }}>
          {sessions.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => navigation.navigate('SessionDetail', { sessionId: s.id })}
              style={({ pressed }) => [
                {
                  padding: tokens.spacing.md,
                  backgroundColor: tokens.colors.surface,
                  borderRadius: tokens.radius.md,
                  borderWidth: 1,
                  borderColor: tokens.colors.border,
                },
                pressed ? { opacity: 0.85 } : null,
              ]}
            >
              <AppText variant="subtitle">{s.title}</AppText>
              <AppText color="textSecondary">{formatDate(s.ended_at ?? s.started_at)}</AppText>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
