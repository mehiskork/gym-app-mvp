import { api } from './client';
import { ApiError } from './errors';
import { accountSessionStore } from '../auth/accountSessionStore';

export type MeResponse = {
    principalType: string;
    externalAccountId: string;
    subject: string;
    issuer?: string;
};

export async function getMeWithAccountAuth(): Promise<MeResponse> {
    const session = await accountSessionStore.getUsable();
    if (!session?.accessToken) {
        throw new Error('No account session token available');
    }

    try {
        return await api.get<MeResponse>('/me', {
            headers: {
                Authorization: `Bearer ${session.accessToken}`,
            },
        });
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
            await accountSessionStore.invalidate('me_401');
        }
        throw error;
    }
}