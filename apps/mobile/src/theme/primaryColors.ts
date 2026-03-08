import { tokens } from './tokens';

export type PrimaryColorKey = 'orange' | 'cyan' | 'purple' | 'lime' | 'pink';

export type PrimaryColorOption = {
    key: PrimaryColorKey;
    label: string;
    value: string;
    onPrimary: string;
};

export const PRIMARY_COLOR_OPTIONS: readonly PrimaryColorOption[] = [
    {
        key: 'orange',
        label: 'Orange',
        value: tokens.colors.primary,
        onPrimary: tokens.colors.onPrimary,
    },
    {
        key: 'cyan',
        label: 'Cyan',
        value: '#31F6EF',
        onPrimary: '#062321',
    },
    {
        key: 'purple',
        label: 'Purple',
        value: '#8B5CF6',
        onPrimary: '#F5F7FA',
    },
    {
        key: 'lime',
        label: 'Lime',
        value: '#A3E635',
        onPrimary: '#162105',
    },
    {
        key: 'pink',
        label: 'Pink',
        value: '#FF6EB4',
        onPrimary: '#2D0E22',
    },
] as const;

export const DEFAULT_PRIMARY_COLOR_KEY: PrimaryColorKey = 'orange';

export function isPrimaryColorKey(value: unknown): value is PrimaryColorKey {
    return PRIMARY_COLOR_OPTIONS.some((option) => option.key === value);
}

export function getPrimaryColorOption(key: PrimaryColorKey): PrimaryColorOption {
    return (
        PRIMARY_COLOR_OPTIONS.find((option) => option.key === key) ??
        PRIMARY_COLOR_OPTIONS[0]
    );
}
