import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { tokens } from '../theme/tokens';
import {
  deleteAllCompletedSessions,
  deleteSession,
  listCompletedSessions,
  type CompletedSessionRow,
} from '../db/historyRepo';

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

  const canDeleteAll = sessions.length > 0;

  const confirmDeleteOne = useCallback(
    (s: CompletedSessionRow) => {
      Alert.alert('Delete workout?', 'This will remove the workout from your history.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSession(s.id);
            load();
          },
        },
      ]);
    },
    [load],
  );

  const confirmDeleteAll = useCallback(() => {
    Alert.alert(
      'Delete all history?',
      'This will remove all completed workouts from your history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => {
            deleteAllCompletedSessions();
            load();
          },
        },
      ],
    );
  }, [load]);

  const header = useMemo(
    () => (
      <View style={{ gap: tokens.spacing.md }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <AppText variant="title">History</AppText>

          <Pressable
            onPress={confirmDeleteAll}
            disabled={!canDeleteAll}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: tokens.spacing.xs,
                opacity: canDeleteAll ? 1 : 0.4,
                paddingVertical: tokens.spacing.sm,
                paddingHorizontal: tokens.spacing.sm,
                borderRadius: tokens.radius.sm,
                borderWidth: 1,
                borderColor: tokens.colors.border,
              },
              pressed && canDeleteAll ? { opacity: 0.85 } : null,
            ]}
            accessibilityLabel="Delete all history"
          >
            <Ionicons name="trash-outline" size={18} color={tokens.colors.textSecondary} />
            <AppText color="textSecondary">Delete all</AppText>
          </Pressable>
        </View>

        {sessions.length === 0 ? (
          <AppText color="textSecondary">No completed workouts yet.</AppText>
        ) : null}
      </View>
    ),
    [canDeleteAll, confirmDeleteAll, sessions.length],
  );

  return (
    <Screen style={{ flex: 1 }}>
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: tokens.spacing.xl, gap: tokens.spacing.sm }}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: tokens.spacing.sm,
              padding: tokens.spacing.md,
              backgroundColor: tokens.colors.surface,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
            }}
          >
            <Pressable
              onPress={() => navigation.navigate('SessionDetail', { sessionId: item.id })}
              style={({ pressed }) => [{ flex: 1 }, pressed ? { opacity: 0.85 } : null]}
            >
              <AppText variant="subtitle">{item.title}</AppText>
              <AppText color="textSecondary">
                {formatDate(item.ended_at ?? item.started_at)}
              </AppText>
            </Pressable>

            <Pressable
              onPress={() => confirmDeleteOne(item)}
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
              accessibilityLabel="Delete workout from history"
            >
              <Ionicons name="trash-outline" size={20} color={tokens.colors.textSecondary} />
            </Pressable>
          </View>
        )}
      />
    </Screen>
  );
}
