import { tokens } from './tokens';

export type PrimaryColorKey = 'orange' | 'cyan' | 'purple' | 'lime' | 'pink' | 'crimson';

export type PrimaryColorOption = {
    key: PrimaryColorKey;
    label: string;
    primary: string;
    primarySoft: string;
    primaryBorder: string;
    primaryTextOnColor: string;
};

export const PRIMARY_COLOR_OPTIONS: readonly PrimaryColorOption[] = [
    {
        key: 'orange',
        label: 'Orange',
        primary: tokens.colors.primary,
        primarySoft: 'rgba(245, 138, 42, 0.2)',
        primaryBorder: 'rgba(245, 138, 42, 0.45)',
        primaryTextOnColor: tokens.colors.onPrimary,
    },
    {
        key: 'cyan',
        label: 'Cyan',
        primary: '#31F6EF',
        primarySoft: 'rgba(49, 246, 239, 0.2)',
        primaryBorder: 'rgba(49, 246, 239, 0.5)',
        primaryTextOnColor: '#062321',
    },
    {
        key: 'purple',
        label: 'Purple',
        primary: '#8B5CF6',
        primarySoft: 'rgba(139, 92, 246, 0.2)',
        primaryBorder: 'rgba(139, 92, 246, 0.5)',
        primaryTextOnColor: '#F5F7FA',
    },
    {
        key: 'lime',
        label: 'Lime',
        primary: '#A3E635',
        primarySoft: 'rgba(163, 230, 53, 0.22)',
        primaryBorder: 'rgba(163, 230, 53, 0.5)',
        primaryTextOnColor: '#162105',
    },
    {
        key: 'pink',
        label: 'Pink',
        primary: '#FF6EB4',
        primarySoft: 'rgba(255, 110, 180, 0.2)',
        primaryBorder: 'rgba(255, 110, 180, 0.5)',
        primaryTextOnColor: '#2D0E22',
    },
    {
        key: 'crimson',
        label: 'Crimson',
        primary: '#EF4444',
        primarySoft: 'rgba(239, 68, 68, 0.2)',
        primaryBorder: 'rgba(239, 68, 68, 0.5)',
        primaryTextOnColor: '#FDF2F2',
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
