import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { tokens } from '../theme/tokens';
import { api } from '../api/client';
import { ApiError } from '../api/errors';
import { pauseSync, resumeSync } from '../db/appMetaRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'ClaimStart'>;

type ClaimStartResponse = {
    claimId: string;
    code: string;
    expiresAt: string;
};

type ClaimErrorState = {
    message: string;
    canRetry: boolean;
};

export function ClaimStartScreen({ navigation }: Props) {
    const [loading, setLoading] = useState(false);
    const [code, setCode] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [error, setError] = useState<ClaimErrorState | null>(null);

    useEffect(() => {
        pauseSync('claim');
        return () => {
            resumeSync();
        };
    }, []);

    const handleGenerate = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.post<ClaimStartResponse>('/claim/start');
            setCode(data.code);
            setExpiresAt(data.expiresAt);
        } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Something went wrong.';
            if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
                setError({
                    message: 'Too many attempts. Please wait a moment and try again.',
                    canRetry: true,
                });
            } else if (err instanceof ApiError && (err.isNetworkError || err.isTimeout)) {
                setError({
                    message: 'Network issue. Check your connection and retry.',
                    canRetry: true,
                });
            } else {
                setError({ message, canRetry: false });
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const handleCopy = useCallback(async () => {
        if (!code) return;
        await Clipboard.setStringAsync(code);
        Alert.alert('Copied', 'Code copied to clipboard.');
    }, [code]);

    const handleCancel = useCallback(() => {
        resumeSync();
        navigation.goBack();
    }, [navigation]);

    const expiresLabel = useMemo(() => {
        if (!expiresAt) return null;
        const date = new Date(expiresAt);
        return Number.isNaN(date.getTime()) ? expiresAt : date.toLocaleString();
    }, [expiresAt]);

    return (
        <Screen padded bottomInset="none" style={{ gap: tokens.spacing.lg }}>
            <View style={{ gap: tokens.spacing.sm }}>
                <Text variant="muted">
                    Generate a claim code to link this device with your account. Keep this screen open while
                    you complete the flow.
                </Text>
            </View>

            <Button title="Generate code" onPress={handleGenerate} loading={loading} />

            {error ? (
                <View style={{ gap: tokens.spacing.xs }}>
                    <Text color={tokens.colors.danger}>{error.message}</Text>
                    {error.canRetry ? (
                        <Pressable onPress={handleGenerate}>
                            <Text color={tokens.colors.primary}>Retry</Text>
                        </Pressable>
                    ) : null}
                </View>
            ) : null}

            {code ? (
                <View
                    style={{
                        padding: tokens.spacing.lg,
                        backgroundColor: tokens.colors.surface,
                        borderRadius: tokens.radius.lg,
                        borderWidth: 1,
                        borderColor: tokens.colors.border,
                        gap: tokens.spacing.sm,
                    }}
                >
                    <Text variant="subtitle" style={{ textAlign: 'center', letterSpacing: 2 }}>
                        {code}
                    </Text>
                    {expiresLabel ? (
                        <Text variant="muted" style={{ textAlign: 'center' }}>
                            Expires at {expiresLabel}
                        </Text>
                    ) : null}
                    <Button title="Copy code" variant="secondary" onPress={handleCopy} />
                </View>
            ) : null}

            <Button title="Cancel" variant="secondary" onPress={handleCancel} />
        </Screen>
    );
}