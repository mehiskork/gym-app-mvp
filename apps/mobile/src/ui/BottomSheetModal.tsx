import React, { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
    Keyboard,
    KeyboardEvent,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native';
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
    keyboardAware?: boolean;
};

export function getSheetKeyboardOffset(keyboardHeight: number, bottomInset: number): number {
    return Math.max(0, keyboardHeight - bottomInset);
}

export function getAndroidKeyboardOffsetFromVisibleArea(windowHeight: number, keyboardTopY?: number): number {
    if (keyboardTopY == null || Number.isNaN(keyboardTopY)) return 0;
    return Math.max(0, windowHeight - keyboardTopY);
}

export function getSheetMaxHeight(windowHeight: number, keyboardOffset: number): number {
    const verticalMargin = tokens.spacing.xxl * 2;
    return Math.max(240, windowHeight - keyboardOffset - verticalMargin);
}

export function BottomSheetModal({
    visible,
    title,
    onClose,
    children,
    actions,
    maxWidth,
    testID,
    keyboardAware = false,
}: BottomSheetModalProps) {
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        if (!keyboardAware) return;
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSub = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
            const keyboardTopY = event.endCoordinates?.screenY;
            if (Platform.OS === 'android') {
                const imeOffset = getAndroidKeyboardOffsetFromVisibleArea(windowHeight, keyboardTopY);
                setKeyboardHeight(imeOffset || event.endCoordinates.height);
                return;
            }
            setKeyboardHeight(event.endCoordinates.height);
        });
        const hideSub = Keyboard.addListener(hideEvent, () => {
            setKeyboardHeight(0);
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, [keyboardAware, windowHeight]);

    const keyboardOffset = keyboardAware
        ? Platform.OS === 'android'
            ? keyboardHeight
            : getSheetKeyboardOffset(keyboardHeight, insets.bottom)
        : 0;
    const maxSheetHeight = keyboardAware ? getSheetMaxHeight(windowHeight, keyboardOffset) : undefined;

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
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{
                        width: '100%',
                        marginBottom: keyboardOffset,
                    }}
                >
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
                            maxHeight: maxSheetHeight,
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
                        {keyboardAware ? (
                            <ScrollView
                                keyboardShouldPersistTaps="handled"
                                style={{ flexGrow: 0 }}
                                contentContainerStyle={{ paddingBottom: tokens.spacing.xs }}
                            >
                                {children}
                            </ScrollView>
                        ) : (
                            children
                        )}
                        {actions ? <View style={{ marginTop: tokens.spacing.lg }}>{actions}</View> : null}
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal >
    );
}