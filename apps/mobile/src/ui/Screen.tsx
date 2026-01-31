import React from 'react';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { tokens } from '../theme/tokens';

type ScreenProps = {
    children: ReactNode;
    padded?: boolean;
    scroll?: boolean;
    backgroundColor?: string;
    style?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({
    children,
    padded = true,
    scroll = false,
    backgroundColor,
    style,
    contentStyle,
}: ScreenProps) {
    const insets = useSafeAreaInsets();
    const paddingValue = padded ? tokens.spacing.lg : 0;
    const baseContentStyle: ViewStyle = {
        paddingHorizontal: paddingValue,
        paddingTop: paddingValue,
        paddingBottom: paddingValue + insets.bottom,
    };
    const bgColor = backgroundColor ?? tokens.colors.bg;

    if (scroll) {
        return (
            <SafeAreaView style={[{ flex: 1, backgroundColor: bgColor }, style]}>
                <ScrollView
                    contentContainerStyle={[baseContentStyle, contentStyle]}
                    showsVerticalScrollIndicator={false}
                >
                    {children}
                </ScrollView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[{ flex: 1, backgroundColor: bgColor }, style]}>
            <View style={[{ flex: 1 }, baseContentStyle, contentStyle]}>{children}</View>
        </SafeAreaView>
    );
}