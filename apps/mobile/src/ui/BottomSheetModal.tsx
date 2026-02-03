import React from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tokens } from '../theme/tokens';
import { Text } from './Text';

type BottomSheetModalProps = {
    visible: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
    actions?: ReactNode;
    maxWidth?: number;
    testID?: string;
};

export function BottomSheetModal({
    visible,
    title,
    onClose,
    children,
    actions,
    maxWidth,
    testID,
}: BottomSheetModalProps) {
    const insets = useSafeAreaInsets();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View
                style={{
                    flex: 1,
                    justifyContent: 'flex-end',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                }}
            >
                <Pressable
                    style={{ ...StyleSheet.absoluteFillObject }}
                    onPress={onClose}
                    accessibilityLabel="Dismiss finish workout sheet"
                />
                <View
                    testID={testID}
                    style={{
                        backgroundColor: tokens.colors.surface,
                        borderTopLeftRadius: tokens.radius.xl,
                        borderTopRightRadius: tokens.radius.xl,
                        borderWidth: 1,
                        borderColor: tokens.colors.border,
                        paddingHorizontal: tokens.spacing.lg,
                        paddingTop: tokens.spacing.lg,
                        paddingBottom: insets.bottom + tokens.spacing.lg,
                        shadowColor: '#000',
                        shadowOpacity: 0.3,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: -6 },
                        elevation: 12,
                        alignSelf: 'center',
                        width: '100%',
                        maxWidth: maxWidth ?? undefined,
                    }}
                >
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: tokens.spacing.lg,
                        }}
                    >
                        <Text variant="subtitle" weight="700">
                            {title}
                        </Text>
                        <Pressable
                            onPress={onClose}
                            accessibilityLabel="Close sheet"
                            style={({ pressed }) => [
                                {
                                    minHeight: tokens.touchTargetMin,
                                    minWidth: tokens.touchTargetMin,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: tokens.radius.md,
                                },
                                pressed ? { opacity: 0.8 } : null,
                            ]}
                        >
                            <Ionicons name="close" size={20} color={tokens.colors.text} />
                        </Pressable>
                    </View>
                    {children}
                    {actions ? <View style={{ marginTop: tokens.spacing.lg }}>{actions}</View> : null}
                </View>
            </View>
        </Modal>
    );
}