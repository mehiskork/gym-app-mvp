import { api } from './client';
import { ApiError } from './errors';
import { accountSessionStore } from '../auth/accountSessionStore';
import { getUsableAccountSessionWithFreshToken } from '../auth/firebaseGoogleAuthClient';

export type MeResponse = {
  principalType: string;
  externalAccountId: string;
  subject: string;
  issuer?: string;
};

export async function getMeWithAccessToken(accessToken: string): Promise<MeResponse> {
  return api.get<MeResponse>('/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function getMeWithAccountAuth(): Promise<MeResponse> {
  const session = await getUsableAccountSessionWithFreshToken();
  if (!session?.accessToken) {
    throw new Error('No account session token available');
  }

  try {
    return await getMeWithAccessToken(session.accessToken);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await accountSessionStore.invalidate('me_401');
    }
    throw error;
  }
}
