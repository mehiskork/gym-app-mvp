import React from 'react';
import { View } from 'react-native';

import type { CardioProfile, CardioSummary } from '../../db/exerciseTypes';
import { Input, Text } from '../../ui';
import { tokens } from '../../theme/tokens';

type CardioSummaryEditorProps = {
    profile: CardioProfile | null;
    summary: CardioSummary;
    editable: boolean;
    onFieldEndEditing: (field: keyof CardioSummary, value: string) => void;
};

function fieldsForProfile(profile: CardioProfile | null): Array<{ key: keyof CardioSummary; label: string; placeholder: string }> {
    switch (profile) {
        case 'treadmill':
            return [
                { key: 'duration_seconds', label: 'Duration (sec)', placeholder: 'e.g. 1800' },
                { key: 'distance_km', label: 'Distance (km)', placeholder: 'e.g. 5.0' },
                { key: 'speed_kph', label: 'Speed (km/h)', placeholder: 'e.g. 10.0' },
                { key: 'incline_percent', label: 'Incline (%)', placeholder: 'e.g. 2.0' },
            ];
        case 'bike':
            return [
                { key: 'duration_seconds', label: 'Duration (sec)', placeholder: 'e.g. 1800' },
                { key: 'distance_km', label: 'Distance (km)', placeholder: 'e.g. 12.0' },
                { key: 'resistance_level', label: 'Resistance', placeholder: 'e.g. 6' },
            ];
        case 'ergometer':
            return [
                { key: 'duration_seconds', label: 'Duration (sec)', placeholder: 'e.g. 1200' },
                { key: 'distance_km', label: 'Distance (km)', placeholder: 'e.g. 4.0' },
                { key: 'pace_seconds_per_km', label: 'Pace (sec/km)', placeholder: 'e.g. 150' },
            ];
        case 'stairs':
            return [
                { key: 'duration_seconds', label: 'Duration (sec)', placeholder: 'e.g. 900' },
                { key: 'floors', label: 'Floors', placeholder: 'e.g. 40' },
                { key: 'stair_level', label: 'Level', placeholder: 'e.g. 8' },
            ];
        case 'elliptical':
            return [
                { key: 'duration_seconds', label: 'Duration (sec)', placeholder: 'e.g. 1800' },
                { key: 'distance_km', label: 'Distance (km)', placeholder: 'e.g. 6.0' },
                { key: 'resistance_level', label: 'Resistance', placeholder: 'e.g. 5' },
            ];
        default:
            return [{ key: 'duration_seconds', label: 'Duration (sec)', placeholder: 'e.g. 900' }];
    }
}

export function CardioSummaryEditor({ profile, summary, editable, onFieldEndEditing }: CardioSummaryEditorProps) {
    const fields = fieldsForProfile(profile);
    return (
        <View style={{ gap: tokens.spacing.sm }}>
            <Text variant="muted">Cardio summary</Text>
            {fields.map((field) => (
                <Input
                    key={field.key}
                    label={field.label}
                    defaultValue={summary[field.key] === null ? '' : String(summary[field.key])}
                    placeholder={field.placeholder}
                    keyboardType="decimal-pad"
                    editable={editable}
                    onEndEditing={(event) => onFieldEndEditing(field.key, event.nativeEvent.text)}
                />
            ))}
        </View>
    );
}