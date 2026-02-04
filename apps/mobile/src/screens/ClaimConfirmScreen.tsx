import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { v4 as uuidv4 } from 'uuid';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { tokens } from '../theme/tokens';
import { apiPost, ApiError } from '../utils/apiClient';
import { getString, setString } from '../utils/prefs';
import { pauseSync, resumeSync, setClaimed, setClaimedUserId } from '../db/appMetaRepo';

const DEV_USER_ID_KEY = 'claim_dev_user_id';

type Props = NativeStackScreenProps<RootStackParamList, 'ClaimConfirm'>;

type ClaimConfirmResponse = {
    guestUserId: string;
    userId: string;
    status: string;
};

export function ClaimConfirmScreen({ navigation }: Props) {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        pauseSync('claim');
    }, []);

    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', () => {
            const state = navigation.getState();
            const hasClaimStart = state.routes.some((r) => r.name === 'ClaimStart');
            if (!hasClaimStart) {
                resumeSync();
            }
        });

        return unsubscribe;
    }, [navigation]);

    const getOrCreateDevUserId = useCallback(async () => {
        const existing = await getString(DEV_USER_ID_KEY);
        if (existing) return existing;
        const next = uuidv4();
        await setString(DEV_USER_ID_KEY, next);
        return next;
    }, []);

    const handleConfirm = useCallback(async () => {
        const trimmed = code.trim();
        if (!trimmed) {
            setError('Enter a claim code to continue.');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const devUserId = await getOrCreateDevUserId();
            const data = await apiPost<ClaimConfirmResponse>(
                '/claim/confirm',
                { code: trimmed },
                { headers: { 'X-User-Id': devUserId } },
            );

            setClaimed(true);
            setClaimedUserId(data.userId);
            setSuccess('Account linked successfully. Sync will resume shortly.');
            resumeSync();
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.code === 'CLAIM_INVALID') {
                    setError('That code is invalid. Double-check and try again.');
                } else if (err.code === 'CLAIM_EXPIRED') {
                    setError('That code expired. Generate a new code and retry.');
                } else if (err.code === 'RATE_LIMITED') {
                    setError('Too many attempts. Please wait before trying again.');
                } else {
                    setError(err.message);
                }
            } else {
                setError('Something went wrong. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    }, [code, getOrCreateDevUserId]);

    const handleCancel = useCallback(() => {
        resumeSync();
        navigation.goBack();
    }, [navigation]);

    return (
        <Screen padded bottomInset="none" style={{ gap: tokens.spacing.lg }}>
            <View style={{ gap: tokens.spacing.sm }}>
                <Text variant="title">Confirm claim (dev)</Text>
                <Text variant="muted">
                    Enter a claim code to confirm the link. This uses a dev-only header for now.
                </Text>
            </View>

            <Input
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                placeholder="Enter code"
                placeholderTextColor={tokens.colors.textSecondary}

            />

            {error ? <Text color={tokens.colors.danger}>{error}</Text> : null}
            {success ? <Text color={tokens.colors.primary}>{success}</Text> : null}

            <Button title="Confirm" onPress={handleConfirm} loading={loading} />

            <Button title="Cancel" variant="secondary" onPress={handleCancel} />
        </Screen>
    );
}