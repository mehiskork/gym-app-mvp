import { api } from './client';
import { accountSessionStore } from '../auth/accountSessionStore';

export type MeResponse = {
    principalType: string;
    externalAccountId: string;
    subject: string;
    issuer?: string;
};

export async function getMeWithAccountAuth(): Promise<MeResponse> {
    const session = await accountSessionStore.get();
    if (!session?.accessToken) {
        throw new Error('No account session token available');
    }

    return api.get<MeResponse>('/me', {
        headers: {
            Authorization: `Bearer ${session.accessToken}`,
        },
    });
}