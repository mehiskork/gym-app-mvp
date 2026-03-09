import React, { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { getSettings, updateSettings } from '../db/settingsRepo';
import { DEFAULT_PRIMARY_COLOR_KEY, getPrimaryColorOption, type PrimaryColorKey } from './primaryColors';
import { tokens } from './tokens';

type ThemeColors = Omit<typeof tokens.colors, 'primary' | 'onPrimary'> & {
    primary: string;
    primarySoft: string;
    primaryBorder: string;
    primaryTextOnColor: string;
};

type AppTheme = {
    colors: ThemeColors;
    primaryColorKey: PrimaryColorKey;
    setPrimaryColorKey: (next: PrimaryColorKey) => void;
};

const ThemeContext = createContext<AppTheme | null>(null);

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
                primary: selected.primary,
                primarySoft: selected.primarySoft,
                primaryBorder: selected.primaryBorder,
                primaryTextOnColor: selected.primaryTextOnColor,
            },
        }),
        [
            primaryColorKey,
            selected.primary,
            selected.primaryBorder,
            selected.primarySoft,
            selected.primaryTextOnColor,
        ],
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