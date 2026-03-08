import React, { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { getSettings, updateSettings } from '../db/settingsRepo';
import { DEFAULT_PRIMARY_COLOR_KEY, getPrimaryColorOption, type PrimaryColorKey } from './primaryColors';
import { tokens } from './tokens';

type ThemeColors = Omit<typeof tokens.colors, 'primary' | 'onPrimary'> & {
    primary: string;
    onPrimary: string;
    primaryTint: string;
};

type AppTheme = {
    colors: ThemeColors;
    primaryColorKey: PrimaryColorKey;
    setPrimaryColorKey: (next: PrimaryColorKey) => void;
};

const ThemeContext = createContext<AppTheme | null>(null);

function withAlpha(hex: string, alpha: number): string {
    const normalized = hex.replace('#', '');
    if (normalized.length !== 6) return hex;
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [primaryColorKey, setPrimaryColorKeyState] = useState<PrimaryColorKey>(
        getSettings().primaryColorKey ?? DEFAULT_PRIMARY_COLOR_KEY,
    );

    const selected = getPrimaryColorOption(primaryColorKey);

    const value = useMemo<AppTheme>(
        () => ({
            primaryColorKey,
            setPrimaryColorKey: (next) => {
                setPrimaryColorKeyState(next);
                updateSettings({ primaryColorKey: next });
            },
            colors: {
                ...tokens.colors,
                primary: selected.value,
                onPrimary: selected.onPrimary,
                primaryTint: withAlpha(selected.value, 0.16),
            },
        }),
        [primaryColorKey, selected.onPrimary, selected.value],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): AppTheme {
    const value = useContext(ThemeContext);
    if (!value) {
        throw new Error('useAppTheme must be used inside ThemeProvider');
    }
    return value;
}