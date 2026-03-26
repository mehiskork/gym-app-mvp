import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LoggerSet } from '../../db/workoutLoggerRepo';
import { IconButton, Text } from '../../ui';
import { tokens } from '../../theme/tokens';
import { formatOptionalNumber } from '../../utils/format';


type SetRowProps = {
    set: LoggerSet;

    onWeightEndEditing: (value: string) => void;
    onRepsEndEditing: (value: string) => void;
    onToggleComplete: () => void;
    onDelete: () => void;
    onEditFocus?: (metrics: { pageY: number; height: number }) => void;
};

export function SetRow({
    set,
    onWeightEndEditing,
    onRepsEndEditing,
    onToggleComplete,
    onDelete,
    onEditFocus,
}: SetRowProps) {
    const [rowWidth, setRowWidth] = React.useState(0);
    const rowRef = React.useRef<View | null>(null);
    const completed = set.is_completed === 1;
    const rowStyle = completed ? styles.completedRow : styles.row;
    const inputStyle = completed ? styles.completedInput : styles.input;
    const checkStyle = completed ? styles.checkCompleted : styles.check;
    const buttonSize = tokens.touchTargetMin;
    const rightActionsGap = tokens.spacing.xs;
    const rightActionsWidth = buttonSize * 2 + rightActionsGap;
    const rowHorizontalPadding = 0;
    const setColWidth = 18;
    const setInputGap = 0;
    const inputGap = tokens.spacing.xs;
    const rowGap = tokens.spacing.xs;
    const minInputWidth = 88;
    const maxInputWidth = 132;

    const available =
        rowWidth > 0
            ? rowWidth - rowHorizontalPadding * 2 - setColWidth - rightActionsWidth - setInputGap - rowGap
            : 0;
    const baseInputWidth = available > 0 ? Math.floor((available - inputGap) / 2) : maxInputWidth;
    const inputWidth = Math.max(minInputWidth, Math.min(baseInputWidth, maxInputWidth));
    const inputPadding = tokens.spacing.md;

    const handleRowLayout = React.useCallback(
        (event: { nativeEvent: { layout: { width: number } } }) => {
            const { width } = event.nativeEvent.layout;
            if (width !== rowWidth) {
                setRowWidth(width);
            }
        },
        [rowWidth],
    );

    const handleEditFocus = React.useCallback(() => {
        if (!onEditFocus || !rowRef.current) return;
        rowRef.current.measureInWindow((_x, pageY, _width, height) => {
            onEditFocus({ pageY, height });
        });
    }, [onEditFocus]);

    return (
        <View ref={rowRef} style={rowStyle} onLayout={handleRowLayout}>
            <View style={[styles.leftCluster, { gap: setInputGap }]}>
                <View style={[styles.setLabel, { width: setColWidth }]}>
                    <Text
                        testID="set-number"
                        variant="body"
                        color={tokens.colors.mutedText}
                        style={styles.setNumberText}
                    >
                        {set.set_index}
                    </Text>
                </View>
                <View style={[styles.inputs, { gap: inputGap }]}>
                    <View style={[styles.inputWrapper, { width: inputWidth }]}>
                        <TextInput
                            testID="weight-input"
                            defaultValue={formatOptionalNumber(set.weight, 2)}
                            maxLength={6}
                            selectTextOnFocus
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={tokens.colors.textSecondary}
                            style={[inputStyle, { width: inputWidth, paddingHorizontal: inputPadding }]}
                            onEndEditing={(e) => onWeightEndEditing(e.nativeEvent.text)}
                            onFocus={handleEditFocus}
                        />
                    </View>

                    <View style={[styles.inputWrapper, styles.repsInputWrapper, { width: inputWidth }]}>
                        <TextInput
                            testID="reps-input"
                            defaultValue={set.reps === null ? '' : String(set.reps)}
                            maxLength={3}
                            selectTextOnFocus
                            keyboardType="number-pad"
                            placeholder="0"
                            placeholderTextColor={tokens.colors.textSecondary}
                            style={[inputStyle, { width: inputWidth, paddingHorizontal: inputPadding }]}
                            onEndEditing={(e) => onRepsEndEditing(e.nativeEvent.text)}
                            onFocus={handleEditFocus}
                        />
                    </View>
                </View>
            </View>

            <View
                style={[
                    styles.rightCluster,
                    { width: rightActionsWidth, gap: rightActionsGap, marginLeft: rowGap },
                ]}
            >
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

                <IconButton
                    onPress={onDelete}
                    size={buttonSize}
                    accessibilityLabel="Delete set"
                    variant="danger"
                    icon={<Ionicons name="trash-outline" size={18} />}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    leftCluster: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    setLabel: {
        width: 32,
        alignItems: 'center',
    },
    setNumberText: {
        fontSize: tokens.typography.subtitle.fontSize + 2,
        fontWeight: tokens.typography.subtitle.fontWeight,
        lineHeight: tokens.typography.subtitle.fontSize + 6,
        textAlign: 'center',
    },
    inputs: {
        flex: 1,
        flexDirection: 'row',
        flexShrink: 1,
    },
    inputWrapper: {
        overflow: 'hidden',
        borderRadius: tokens.radius.md,
    },
    repsInputWrapper: {
        marginRight: tokens.spacing.xs,
    },
    rightCluster: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 0,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: tokens.spacing.sm,
        paddingHorizontal: 0,
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
        paddingHorizontal: 0,
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: tokens.colors.success,
        backgroundColor: tokens.colors.successSurface,
    },
    input: {
        minHeight: tokens.touchTargetMin,
        fontSize: tokens.typography.subtitle.fontSize + 2,
        fontWeight: tokens.typography.subtitle.fontWeight,
        lineHeight: tokens.typography.subtitle.fontSize + 6,
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: tokens.colors.border,
        paddingVertical: tokens.spacing.xs,
        paddingHorizontal: tokens.spacing.md,
        color: tokens.colors.text,
        backgroundColor: tokens.colors.surface,
        textAlign: 'center',
        textAlignVertical: 'center',
    },
    completedInput: {
        minHeight: tokens.touchTargetMin,
        fontSize: tokens.typography.subtitle.fontSize + 2,
        fontWeight: tokens.typography.subtitle.fontWeight,
        lineHeight: tokens.typography.subtitle.fontSize + 6,
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: tokens.colors.success,
        paddingHorizontal: tokens.spacing.md,
        paddingVertical: tokens.spacing.xs,
        color: tokens.colors.text,
        backgroundColor: tokens.colors.successSurface,
        textAlign: 'center',
        textAlignVertical: 'center',
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