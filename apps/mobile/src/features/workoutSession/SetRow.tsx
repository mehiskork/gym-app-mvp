import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { LoggerSet } from '../../db/workoutLoggerRepo';
import { Text } from '../../ui';
import { tokens } from '../../theme/tokens';
import { formatOptionalNumber } from '../../utils/format';


type SetRowProps = {
    set: LoggerSet;

    onWeightEndEditing: (value: string) => void;
    onRepsEndEditing: (value: string) => void;
    onToggleComplete: () => void;
    onDelete: () => void;
};

export function SetRow({
    set,
    onWeightEndEditing,
    onRepsEndEditing,
    onToggleComplete,
    onDelete,
}: SetRowProps) {
    const completed = set.is_completed === 1;
    const rowStyle = completed ? styles.completedRow : styles.row;
    const inputStyle = completed ? styles.completedInput : styles.input;
    const checkStyle = completed ? styles.checkCompleted : styles.check;

    return (
        <View style={rowStyle}>
            <View style={{ width: 64 }}>
                <Text variant="label" color={tokens.colors.mutedText}>
                    Set {set.set_index}
                </Text>
            </View>

            <View style={{ flex: 1, flexDirection: 'row', gap: tokens.spacing.sm }}>
                <View style={{ flex: 1 }}>
                    <Text variant="label" color={tokens.colors.mutedText}>
                        kg
                    </Text>
                    <TextInput
                        defaultValue={formatOptionalNumber(set.weight, 2)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={tokens.colors.textSecondary}
                        style={inputStyle}
                        onEndEditing={(e) => onWeightEndEditing(e.nativeEvent.text)}
                    />
                </View>

                <View style={{ flex: 1 }}>
                    <Text variant="label" color={tokens.colors.mutedText}>
                        reps
                    </Text>
                    <TextInput
                        defaultValue={set.reps === null ? '' : String(set.reps)}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={tokens.colors.textSecondary}
                        style={inputStyle}
                        onEndEditing={(e) => onRepsEndEditing(e.nativeEvent.text)}
                    />
                </View>
            </View>

            <Pressable
                onPress={onToggleComplete}
                style={({ pressed }) => [
                    checkStyle,
                    pressed ? { opacity: 0.85 } : null,
                ]}
                accessibilityLabel="Toggle set complete"
            >
                <Ionicons
                    name="checkmark"
                    size={18}
                    color={completed ? tokens.colors.onPrimary : tokens.colors.textSecondary}
                />
            </Pressable>

            <Pressable
                onPress={onDelete}
                style={({ pressed }) => [
                    {
                        minHeight: tokens.touchTargetMin,
                        minWidth: tokens.touchTargetMin,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: tokens.radius.md,
                        borderWidth: 1,
                        borderColor: tokens.colors.border,
                    },
                    pressed ? { opacity: 0.85 } : null,
                ]}
                accessibilityLabel="Delete set"
            >
                <Ionicons name="trash-outline" size={18} color={tokens.colors.destructive} />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing.sm,
        paddingVertical: tokens.spacing.sm,
        paddingHorizontal: tokens.spacing.sm,
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: tokens.colors.border,
        backgroundColor: tokens.colors.surface2,
    },
    completedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing.sm,
        paddingVertical: tokens.spacing.sm,
        paddingHorizontal: tokens.spacing.sm,
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: tokens.colors.success,
        backgroundColor: tokens.colors.successSurface,
    },
    input: {
        minHeight: tokens.touchTargetMin,
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: tokens.colors.border,
        paddingHorizontal: tokens.spacing.md,
        color: tokens.colors.text,
        backgroundColor: tokens.colors.surface,
    },
    completedInput: {
        minHeight: tokens.touchTargetMin,
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: tokens.colors.success,
        paddingHorizontal: tokens.spacing.md,
        color: tokens.colors.text,
        backgroundColor: tokens.colors.successSurface,
    },
    check: {
        minHeight: tokens.touchTargetMin,
        minWidth: tokens.touchTargetMin,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: tokens.colors.border,
        backgroundColor: 'transparent',
    },
    checkCompleted: {
        minHeight: tokens.touchTargetMin,
        minWidth: tokens.touchTargetMin,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: tokens.colors.success,
        backgroundColor: tokens.colors.success,
    },
});