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
    const [rowWidth, setRowWidth] = React.useState(0);
    const completed = set.is_completed === 1;
    const rowStyle = completed ? styles.completedRow : styles.row;
    const inputStyle = completed ? styles.completedInput : styles.input;
    const checkStyle = completed ? styles.checkCompleted : styles.check;

    const buttonSize = tokens.touchTargetMin;
    const rightActionsGap = tokens.spacing.xs;
    const rightActionsWidth = buttonSize * 2 + rightActionsGap;
    const rowHorizontalPadding = tokens.spacing.sm;
    const setColWidth = 32;
    const gap = tokens.spacing.sm;
    const minInputWidth = 64;
    const maxInputWidth = 96;
    const compactMinInputWidth = 56;

    const available =
        rowWidth > 0
            ? rowWidth -
            rowHorizontalPadding * 2 -
            setColWidth -
            rightActionsWidth -
            gap * 3
            : 0;
    const baseInputWidth = available > 0 ? Math.floor(available / 2) : maxInputWidth;
    const clampedInputWidth = Math.max(minInputWidth, Math.min(baseInputWidth, maxInputWidth));
    const isCompact = available > 0 && available < minInputWidth * 2;
    const inputWidth = isCompact
        ? Math.max(compactMinInputWidth, baseInputWidth)
        : clampedInputWidth;
    const inputPadding = isCompact ? tokens.spacing.sm : tokens.spacing.md;

    const handleRowLayout = React.useCallback(
        (event: { nativeEvent: { layout: { width: number } } }) => {
            const { width } = event.nativeEvent.layout;
            if (width !== rowWidth) {
                setRowWidth(width);
            }
        },
        [rowWidth],
    );


    return (
        <View style={rowStyle} onLayout={handleRowLayout}>
            <View style={styles.leftFields}>
                <View style={[styles.setLabel, { width: setColWidth }]}>
                    <Text variant="label" color={tokens.colors.mutedText}>
                        {set.set_index}
                    </Text>
                </View>

                <View style={styles.inputs}>
                    <View style={[styles.inputWrapper, { width: inputWidth }]}>
                        <TextInput
                            defaultValue={formatOptionalNumber(set.weight, 2)}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={tokens.colors.textSecondary}
                            style={[
                                inputStyle,
                                { width: inputWidth, paddingHorizontal: inputPadding },
                            ]}
                            onEndEditing={(e) => onWeightEndEditing(e.nativeEvent.text)}
                        />
                    </View>

                    <View style={[styles.inputWrapper, { width: inputWidth }]}>
                        <TextInput
                            defaultValue={set.reps === null ? '' : String(set.reps)}
                            keyboardType="number-pad"
                            placeholder="0"
                            placeholderTextColor={tokens.colors.textSecondary}
                            style={[
                                inputStyle,
                                { width: inputWidth, paddingHorizontal: inputPadding },
                            ]}
                            onEndEditing={(e) => onRepsEndEditing(e.nativeEvent.text)}
                        />
                    </View>
                </View>
            </View>

            <View style={[styles.rightActions, { width: rightActionsWidth, gap: rightActionsGap }]}>
                <Pressable
                    onPress={onToggleComplete}
                    style={({ pressed }) => [
                        checkStyle,
                        { width: buttonSize, height: buttonSize },
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
                        styles.deleteButton,
                        { width: buttonSize, height: buttonSize },
                        pressed ? { opacity: 0.85 } : null,
                    ]}
                    accessibilityLabel="Delete set"
                >
                    <Ionicons name="trash-outline" size={18} color={tokens.colors.destructive} />
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    leftFields: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing.sm,
    },
    setLabel: {
        width: 32,
    },
    inputs: {
        flex: 1,
        flexDirection: 'row',
        gap: tokens.spacing.sm,
        flexShrink: 1,
    },
    inputWrapper: {
        overflow: 'hidden',
        borderRadius: tokens.radius.md,
    },
    rightActions: {
        flexDirection: 'row',
        alignItems: 'center',

    },
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
        gap: tokens.spacing.xs,
        paddingVertical: tokens.spacing.sm,
        paddingHorizontal: tokens.spacing.sm,
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: tokens.colors.success,
        backgroundColor: tokens.colors.successSurface,
    },
    input: {
        minHeight: tokens.touchTargetMin,
        fontSize: tokens.typography.subtitle.fontSize + 2,
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: tokens.colors.border,
        paddingHorizontal: tokens.spacing.md,
        color: tokens.colors.text,
        backgroundColor: tokens.colors.surface,
    },
    completedInput: {
        minHeight: tokens.touchTargetMin,
        fontSize: tokens.typography.subtitle.fontSize + 2,
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
    deleteButton: {
        minHeight: tokens.touchTargetMin,
        minWidth: tokens.touchTargetMin,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: tokens.colors.border,
    },
});