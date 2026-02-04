jest.mock('../appMetaRepo', () => ({
    getMeta: jest.fn(),
    setMeta: jest.fn(),
}));

import { getMeta, setMeta } from '../appMetaRepo';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from '../settingsRepo';

describe('settingsRepo', () => {
    beforeEach(() => {
        (getMeta as jest.Mock).mockReset();
        (setMeta as jest.Mock).mockReset();
    });

    it('returns defaults when nothing is stored', () => {
        (getMeta as jest.Mock).mockReturnValue(null);
        expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it('persists updates by merging with defaults', () => {
        (getMeta as jest.Mock).mockReturnValue(
            JSON.stringify({ defaultRestSeconds: 90, autoStartRestTimer: true }),
        );

        const next = updateSettings({ restTimerVibration: false });

        expect(next).toEqual({
            defaultRestSeconds: 90,
            autoStartRestTimer: true,
            restTimerVibration: false,
            keepScreenOn: true,
        });
        expect(setMeta).toHaveBeenCalledWith('settings', JSON.stringify(next));
    });
});