import { getMeta, setMeta } from './appMetaRepo';
import { safeJsonParse } from '../utils/json';
import { DEFAULT_PRIMARY_COLOR_KEY, isPrimaryColorKey, type PrimaryColorKey } from '../theme/primaryColors';

export type Settings = {
    defaultRestSeconds: number;
    autoStartRestTimer: boolean;
    restTimerVibration: boolean;
    keepScreenOn: boolean;
    restTimerNotifications: boolean;
    primaryColorKey: PrimaryColorKey;
};

export const DEFAULT_SETTINGS: Settings = {
    defaultRestSeconds: 120,
    autoStartRestTimer: true,
    restTimerVibration: true,
    keepScreenOn: true,
    restTimerNotifications: false,
    primaryColorKey: DEFAULT_PRIMARY_COLOR_KEY,
};

const SETTINGS_KEY = 'settings';

function normalizeSettings(input: unknown): Settings {
    if (!input || typeof input !== 'object') return DEFAULT_SETTINGS;
    const parsed = input as Partial<Settings>;
    return {
        defaultRestSeconds:
            typeof parsed.defaultRestSeconds === 'number'
                ? parsed.defaultRestSeconds
                : DEFAULT_SETTINGS.defaultRestSeconds,
        autoStartRestTimer:
            typeof parsed.autoStartRestTimer === 'boolean'
                ? parsed.autoStartRestTimer
                : DEFAULT_SETTINGS.autoStartRestTimer,
        restTimerVibration:
            typeof parsed.restTimerVibration === 'boolean'
                ? parsed.restTimerVibration
                : DEFAULT_SETTINGS.restTimerVibration,
        keepScreenOn:
            typeof parsed.keepScreenOn === 'boolean' ? parsed.keepScreenOn : DEFAULT_SETTINGS.keepScreenOn,
        restTimerNotifications:
            typeof parsed.restTimerNotifications === 'boolean'
                ? parsed.restTimerNotifications
                : DEFAULT_SETTINGS.restTimerNotifications,
        primaryColorKey: isPrimaryColorKey(parsed.primaryColorKey)
            ? parsed.primaryColorKey
            : DEFAULT_SETTINGS.primaryColorKey,
    };
}

export function getSettings(): Settings {
    const raw = getMeta(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = safeJsonParse(raw);
    return normalizeSettings(parsed);
}

export function updateSettings(patch: Partial<Settings>): Settings {
    const current = getSettings();
    const next = normalizeSettings({ ...current, ...patch });
    setMeta(SETTINGS_KEY, JSON.stringify(next));
    return next;
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
    return getSettings()[key];
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Settings {
    return updateSettings({ [key]: value } as Partial<Settings>);
}