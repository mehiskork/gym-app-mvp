import React from 'react';
import { View } from 'react-native';

import type { CardioProfile, CardioSummary } from '../../db/exerciseTypes';
import { Input } from '../../ui';
import { tokens } from '../../theme/tokens';
import {
  cardioFieldMaxLengths,
  fieldsForCardioProfile,
  formatCardioInputValue,
  parseCardioInput,
} from './cardioInputParsing';

type CardioSummaryEditorProps = {
  profile: CardioProfile | null;
  summary: CardioSummary;
  editable: boolean;
  onFieldEndEditing: (field: keyof CardioSummary, value: string) => boolean;
  onPendingPaceDraftChange?: (value: string | null) => void;
  onEditFocus?: (metrics: { pageY: number; height: number }) => void;
};

const cardioValueInputStyle = {
  fontSize: tokens.typography.subtitle.fontSize + 2,
  fontWeight: tokens.typography.subtitle.fontWeight,
  lineHeight: tokens.typography.subtitle.fontSize + 6,
};

export function CardioSummaryEditor({
  profile,
  summary,
  editable,
  onFieldEndEditing,
  onPendingPaceDraftChange,
  onEditFocus,
}: CardioSummaryEditorProps) {
  const fields = fieldsForCardioProfile(profile);
  const fieldRefs = React.useRef<Partial<Record<keyof CardioSummary, View | null>>>({});
  const lastPersistedValuesRef = React.useRef<Partial<Record<keyof CardioSummary, string>>>({});
  const focusedFieldRef = React.useRef<keyof CardioSummary | null>(null);
  const dirtyFocusedPaceDraftRef = React.useRef<string | null>(null);
  const savedTexts = React.useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(summary) as Array<keyof CardioSummary>).map((field) => [
          field,
          formatCardioInputValue(field, summary[field]),
        ]),
      ) as Record<keyof CardioSummary, string>,
    [summary],
  );
  const [fieldTexts, setFieldTexts] = React.useState(savedTexts);

  React.useEffect(() => {
    if (
      focusedFieldRef.current === 'pace_seconds_per_km' &&
      dirtyFocusedPaceDraftRef.current !== null
    ) {
      setFieldTexts((current) => {
        return {
          ...savedTexts,
          pace_seconds_per_km: current.pace_seconds_per_km ?? dirtyFocusedPaceDraftRef.current,
        };
      });
    } else {
      setFieldTexts(savedTexts);
    }
    lastPersistedValuesRef.current = Object.fromEntries(
      (Object.keys(summary) as Array<keyof CardioSummary>).map((field) => [
        field,
        String(summary[field]),
      ]),
    ) as Record<keyof CardioSummary, string>;
  }, [savedTexts]);
  const rows = fields.reduce<Array<Array<{ key: keyof CardioSummary; label: string }>>>(
    (acc, field, index) => {
      const rowIndex = Math.floor(index / 2);
      if (!acc[rowIndex]) acc[rowIndex] = [];
      acc[rowIndex].push(field);
      return acc;
    },
    [],
  );

  const handleFieldFocus = React.useCallback(
    (field: keyof CardioSummary) => {
      focusedFieldRef.current = field;
      if (!onEditFocus) return;
      const fieldRef = fieldRefs.current[field];
      if (!fieldRef) return;
      fieldRef.measureInWindow((_x, pageY, _width, height) => {
        onEditFocus({ pageY, height });
      });
    },
    [onEditFocus],
  );

  const persistParsedValue = React.useCallback(
    (field: keyof CardioSummary, value: string) => {
      const parsed = parseCardioInput(field, value);
      if (!parsed.ok) return { ok: false as const, accepted: false as const };

      const persistedValue = String(parsed.value);
      lastPersistedValuesRef.current ??= {};
      if (lastPersistedValuesRef.current[field] === persistedValue) {
        return { ok: true as const, accepted: true as const, value: parsed.value };
      }
      const accepted = onFieldEndEditing(field, value);
      if (accepted) {
        lastPersistedValuesRef.current[field] = persistedValue;
      }
      return { ok: true as const, accepted, value: parsed.value };
    },
    [onFieldEndEditing],
  );

  const handleChangeText = React.useCallback(
    (field: keyof CardioSummary, value: string) => {
      setFieldTexts((current) => ({ ...current, [field]: value }));
      if (!editable) return;
      if (field === 'pace_seconds_per_km') {
        dirtyFocusedPaceDraftRef.current = value;
        onPendingPaceDraftChange?.(value);
        return;
      }
      persistParsedValue(field, value);
    },
    [editable, onPendingPaceDraftChange, persistParsedValue],
  );

  const handleEndEditing = React.useCallback(
    (field: keyof CardioSummary, value: string) => {
      const result = persistParsedValue(field, value);
      if (field === 'pace_seconds_per_km') {
        focusedFieldRef.current = null;
        dirtyFocusedPaceDraftRef.current = null;
        onPendingPaceDraftChange?.(null);
      }
      if (!result.ok) {
        setFieldTexts((current) => ({ ...current, [field]: savedTexts[field] }));
        return;
      }

      setFieldTexts((current) => ({
        ...current,
        [field]: result.accepted ? formatCardioInputValue(field, result.value) : savedTexts[field],
      }));
    },
    [onPendingPaceDraftChange, persistParsedValue, savedTexts],
  );

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {rows.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
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
                value={fieldTexts[field.key]}
                keyboardType={field.key === 'pace_seconds_per_km' ? 'number-pad' : 'decimal-pad'}
                placeholder={field.key === 'pace_seconds_per_km' ? '5:30' : undefined}
                helperText={field.key === 'pace_seconds_per_km' ? 'Type 530 for 5:30' : undefined}
                editable={editable}
                inputStyle={cardioValueInputStyle}
                onChangeText={(value) => handleChangeText(field.key, value)}
                onFocus={() => handleFieldFocus(field.key)}
                onEndEditing={(event) => handleEndEditing(field.key, event.nativeEvent.text)}
              />
            </View>
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}
