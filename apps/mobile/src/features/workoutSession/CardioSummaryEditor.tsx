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
    onEditFocus?: (metrics: { pageY: number; height: number }) => void;

};

const cardioValueInputStyle = {
    fontSize: tokens.typography.subtitle.fontSize + 2,
    fontWeight: tokens.typography.subtitle.fontWeight,
    lineHeight: tokens.typography.subtitle.fontSize + 6,
};

const cardioFieldMaxLengths: Record<keyof CardioSummary, number> = {
    duration_seconds: 3,
    distance_km: 5,
    speed_kph: 5,
    incline_percent: 4,
    resistance_level: 4,
    pace_seconds_per_km: 5,
    floors: 4,
    stair_level: 4,
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

export function CardioSummaryEditor({
    profile,
    summary,
    editable,
    onFieldEndEditing,
    onEditFocus,
}: CardioSummaryEditorProps) {
    const fields = fieldsForProfile(profile);
    const fieldRefs = React.useRef<Partial<Record<keyof CardioSummary, View | null>>>({});
    const rows = fields.reduce<Array<Array<{ key: keyof CardioSummary; label: string }>>>((acc, field, index) => {
        const rowIndex = Math.floor(index / 2);
        if (!acc[rowIndex]) acc[rowIndex] = [];
        acc[rowIndex].push(field);
        return acc;
    }, []);

    const handleFieldFocus = React.useCallback(
        (field: keyof CardioSummary) => {
            if (!onEditFocus) return;
            const fieldRef = fieldRefs.current[field];
            if (!fieldRef) return;
            fieldRef.measureInWindow((_x, pageY, _width, height) => {
                onEditFocus({ pageY, height });
            });
        },
        [onEditFocus],
    );

    return (
        <View style={{ gap: tokens.spacing.sm }}>
            {rows.map((row, rowIndex) => (
                <View
                    key={`row-${rowIndex}`}
                    style={{ flexDirection: 'row', gap: tokens.spacing.sm }}
                >
                    {row.map((field) => (
                        <View
                            key={field.key}
                            ref={(node) => {
                                fieldRefs.current[field.key] = node;
                            }}
                            style={{ flex: 1 }}
                        >
                            <Input
                                label={field.label}
                                maxLength={cardioFieldMaxLengths[field.key]}
                                defaultValue={
                                    summary[field.key] === null
                                        ? ''
                                        : field.key === 'duration_seconds'
                                            ? String((summary.duration_seconds ?? 0) / 60)
                                            : String(summary[field.key])
                                }
                                keyboardType="decimal-pad"
                                editable={editable}
                                inputStyle={cardioValueInputStyle}
                                onFocus={() => handleFieldFocus(field.key)}
                                onEndEditing={(event) => onFieldEndEditing(field.key, event.nativeEvent.text)}
                            />
                        </View>
                    ))}
                    {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
                </View>
            ))}
        </View>
    );
}