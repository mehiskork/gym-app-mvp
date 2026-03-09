import React from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../theme/tokens';
import { Button } from './Button';
import { Text } from './Text';

type DestructiveConfirmDialogProps = {
    visible: boolean;
    title: string;
    body: string;
    confirmLabel?: string;
    cancelLabel?: string;
    icon?: ReactNode;
    onClose: () => void;
    onConfirm: () => void;
    testID?: string;
};

export function DestructiveConfirmDialog({
    visible,
    title,
    body,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    icon,
    onClose,
    onConfirm,
    testID,
}: DestructiveConfirmDialogProps) {
    const renderedIcon = icon ?? (
        <Ionicons name="trash-outline" size={18} color={tokens.colors.destructive} />
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={styles.overlay}>
                <Pressable
                    style={StyleSheet.absoluteFillObject}
                    onPress={onClose}
                    accessibilityLabel="Dismiss dialog"
                />
                <View testID={testID} style={styles.card}>
                    <View style={styles.titleRow}>
                        <View style={styles.iconWrap}>{renderedIcon}</View>
                        <Text variant="subtitle" weight="700" style={{ flex: 1 }}>
                            {title}
                        </Text>
                    </View>
                    <Text variant="muted">{body}</Text>
                    <View style={styles.actions}>
                        <View style={{ flex: 1 }}>
                            <Button title={cancelLabel} variant="secondary" onPress={onClose} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Button title={confirmLabel} variant="destructive" onPress={onConfirm} />
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: tokens.spacing.lg,
    },
    card: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: tokens.colors.surface,
        borderRadius: tokens.radius.xl,
        borderWidth: 1,
        borderColor: tokens.colors.border,
        padding: tokens.spacing.lg,
        gap: tokens.spacing.md,
        shadowColor: '#000',
        shadowOpacity: 0.32,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 14,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing.sm,
    },
    iconWrap: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(224, 82, 75, 0.16)',
        borderWidth: 1,
        borderColor: 'rgba(224, 82, 75, 0.35)',
    },
    actions: {
        flexDirection: 'row',
        gap: tokens.spacing.sm,
        marginTop: tokens.spacing.xs,
    },
});