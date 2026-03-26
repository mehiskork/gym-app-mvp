import React from 'react';
import { View } from 'react-native';

import type { CardioProfile, CardioSummary } from '../../db/exerciseTypes';
import { Input } from '../../ui';
import { tokens } from '../../theme/tokens';

type CardioSummaryEditorProps = {
    profile: CardioProfile | null;
    summary: CardioSummary;
    editable: boolean;
    onFieldEndEditing: (field: keyof CardioSummary, value: string) => void;
};

function fieldsForProfile(profile: CardioProfile | null): Array<{ key: keyof CardioSummary; label: string }> {
    switch (profile) {
        case 'treadmill':
            return [
                { key: 'duration_seconds', label: 'Duration (min)' },
                { key: 'distance_km', label: 'Distance (km)' },
                { key: 'speed_kph', label: 'Speed (km/h)' },
                { key: 'incline_percent', label: 'Incline (%)' },
            ];
        case 'bike':
            return [
                { key: 'duration_seconds', label: 'Duration (min)' },
                { key: 'distance_km', label: 'Distance (km)' },
                { key: 'resistance_level', label: 'Resistance' },
            ];
        case 'ergometer':
            return [
                { key: 'duration_seconds', label: 'Duration (min)' },
                { key: 'distance_km', label: 'Distance (km)' },
                { key: 'pace_seconds_per_km', label: 'Pace' },
            ];
        case 'stairs':
            return [
                { key: 'duration_seconds', label: 'Duration (min)' },
                { key: 'floors', label: 'Floors' },
                { key: 'stair_level', label: 'Level' },
            ];
        case 'elliptical':
            return [
                { key: 'duration_seconds', label: 'Duration (min)' },
                { key: 'distance_km', label: 'Distance (km)' },
                { key: 'resistance_level', label: 'Resistance' },
            ];
        default:
            return [{ key: 'duration_seconds', label: 'Duration (min)' }];
    }
}

export function CardioSummaryEditor({ profile, summary, editable, onFieldEndEditing }: CardioSummaryEditorProps) {
    const fields = fieldsForProfile(profile);
    return (
        <View style={{ gap: tokens.spacing.sm }}>
            {fields.map((field) => (
                <Input
                    key={field.key}
                    label={field.label}
                    defaultValue={
                        summary[field.key] === null
                            ? ''
                            : field.key === 'duration_seconds'
                                ? String((summary.duration_seconds ?? 0) / 60)
                                : String(summary[field.key])
                    }
                    keyboardType="decimal-pad"
                    editable={editable}
                    onEndEditing={(event) => onFieldEndEditing(field.key, event.nativeEvent.text)}
                />
            ))}
        </View>
    );
}