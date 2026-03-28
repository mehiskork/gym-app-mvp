jest.mock('../db', () => ({
    exec: jest.fn(),
    query: jest.fn(),
}));

jest.mock('../migrations', () => ({
    migrations: [
        { id: 15, name: 'before_cardio', up: 'SELECT 15;' },
        { id: 16, name: 'cardio_exercises', up: 'SELECT 16;' },
    ],
}));

import { exec, query } from '../db';
import { runMigrations } from '../migrate';

describe('runMigrations cardio drift hardening', () => {
    beforeEach(() => {
        (exec as jest.Mock).mockReset();
        (query as jest.Mock).mockReset();
    });

    it('fails fast with a clear message for legacy cardio_duration_seconds drift', () => {
        (query as jest.Mock)
            .mockReturnValueOnce([])
            .mockReturnValueOnce([
                { name: 'id' },
                { name: 'workout_session_id' },
                { name: 'cardio_duration_seconds' },
            ]);

        expect(() => runMigrations()).toThrow(
            /cardio_duration_seconds present while cardio_duration_minutes is missing/i,
        );

        expect(exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations'));
        expect(exec).toHaveBeenCalledWith('SELECT 15;');
        expect(exec).toHaveBeenCalledWith('INSERT INTO schema_migrations (id, name) VALUES (?, ?)', [15, 'before_cardio']);
        expect(exec).not.toHaveBeenCalledWith('SELECT 16;');
    });

    it('applies migration 16 when cardio schema drift is not present', () => {
        (query as jest.Mock)
            .mockReturnValueOnce([])
            .mockReturnValueOnce([
                { name: 'id' },
                { name: 'workout_session_id' },
                { name: 'cardio_duration_minutes' },
            ]);

        runMigrations();

        expect(exec).toHaveBeenCalledWith('SELECT 16;');
        expect(exec).toHaveBeenCalledWith('INSERT INTO schema_migrations (id, name) VALUES (?, ?)', [16, 'cardio_exercises']);
    });
});