import googleServices from '../../google-services.json';
import { accountSessionStore, type AccountSession } from './accountSessionStore';

const FIREBASE_PROJECT_ID = 'gym-app-mvp-1d7f0';
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

type GoogleServicesConfig = {
  project_info?: {
    project_id?: string;
  };
  client?: Array<{
    api_key?: Array<{ current_key?: string }>;
    oauth_client?: Array<{ client_type?: number; client_id?: string }>;
  }>;
};

type FirebaseIdpResponse = {
  idToken?: string;
  refreshToken?: string;
  localId?: string;
  expiresIn?: string;
  email?: string;
  displayName?: string;
};

type FirebaseRefreshResponse = {
  id_token?: string;
  refresh_token?: string;
  user_id?: string;
  expires_in?: string;
};

type GoogleSignInResponse = {
  idToken?: string | null;
  data?: {
    idToken?: string | null;
    user?: {
      email?: string | null;
      name?: string | null;
    };
  };
  user?: {
    email?: string | null;
    name?: string | null;
  };
};

export type FirebaseGoogleSessionInput = {
  accessToken: string;
  refreshToken: string;
  localId: string;
  expiresAt: string;
  email?: string;
  displayName?: string;
};

export type FirebaseGoogleSignInResult = {
  googleIdToken: string;
  firebaseSession: FirebaseGoogleSessionInput;
};

let googleConfigured = false;

function getGoogleSignInModule(): typeof import('@react-native-google-signin/google-signin') {
  // Keep the native Google module out of syncWorker's Jest import path.
  // The module is ESM in node_modules, and tests that only exercise token refresh do not need it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
}

function getFirebaseClientConfig() {
  const config = googleServices as GoogleServicesConfig;
  const projectId = config.project_info?.project_id;
  if (projectId !== FIREBASE_PROJECT_ID) {
    throw new Error('Firebase client config project id does not match gym-app-mvp-1d7f0.');
  }

  const firebaseClient = config.client?.[0];
  const apiKey = firebaseClient?.api_key?.[0]?.current_key;
  const webClientId = firebaseClient?.oauth_client?.find(
    (client) => client.client_type === 3,
  )?.client_id;

  if (!apiKey || !webClientId) {
    throw new Error('Firebase Google auth config is incomplete.');
  }

  return { apiKey, webClientId };
}

export function buildFirebaseAccountSession(input: FirebaseGoogleSessionInput): AccountSession {
  return {
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    subject: input.localId,
    issuer: FIREBASE_ISSUER,
    expiresAt: input.expiresAt,
    email: input.email,
    displayName: input.displayName,
    provider: 'firebase_google',
  };
}

export function isAccountSessionNearExpiry(
  session: Pick<AccountSession, 'expiresAt'>,
  nowMs = Date.now(),
): boolean {
  if (!session.expiresAt) return false;
  const expiresAtMs = Date.parse(session.expiresAt);
  if (Number.isNaN(expiresAtMs)) return true;
  return expiresAtMs - nowMs <= TOKEN_REFRESH_SKEW_MS;
}

function expiresAtFromSeconds(expiresIn?: string): string {
  const seconds = Number.parseInt(expiresIn ?? '3600', 10);
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 3600;
  return new Date(Date.now() + safeSeconds * 1000).toISOString();
}

function configureGoogleSignIn(): void {
  if (googleConfigured) return;
  const { GoogleSignin } = getGoogleSignInModule();
  const { webClientId } = getFirebaseClientConfig();
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
  });
  googleConfigured = true;
}

function extractGoogleIdToken(response: GoogleSignInResponse): string | null {
  return response.idToken ?? response.data?.idToken ?? null;
}

async function readGoogleIdToken(response: GoogleSignInResponse): Promise<string> {
  const tokenFromResponse = extractGoogleIdToken(response);
  if (tokenFromResponse) return tokenFromResponse;

  const { GoogleSignin } = getGoogleSignInModule();
  const tokens = await GoogleSignin.getTokens();
  if (tokens.idToken) return tokens.idToken;

  throw new Error('Google sign-in did not return an ID token.');
}

async function exchangeGoogleIdTokenForFirebase(
  googleIdToken: string,
): Promise<FirebaseGoogleSessionInput> {
  const { apiKey } = getFirebaseClientConfig();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(
      apiKey,
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
        requestUri: 'http://localhost',
        returnSecureToken: true,
        returnIdpCredential: true,
      }),
    },
  );

  const data = (await response.json().catch(() => ({}))) as FirebaseIdpResponse;
  if (!response.ok || !data.idToken || !data.refreshToken || !data.localId) {
    throw new Error('Firebase token exchange failed.');
  }

  return {
    accessToken: data.idToken,
    refreshToken: data.refreshToken,
    localId: data.localId,
    expiresAt: expiresAtFromSeconds(data.expiresIn),
    email: data.email,
    displayName: data.displayName,
  };
}

export async function signInWithGoogleForFirebase(): Promise<FirebaseGoogleSignInResult> {
  configureGoogleSignIn();
  const { GoogleSignin, statusCodes } = getGoogleSignInModule();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  try {
    const googleResponse = (await GoogleSignin.signIn()) as GoogleSignInResponse;
    const googleIdToken = await readGoogleIdToken(googleResponse);
    const firebaseSession = await exchangeGoogleIdTokenForFirebase(googleIdToken);
    return { googleIdToken, firebaseSession };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === statusCodes.SIGN_IN_CANCELLED
    ) {
      throw new Error('Google sign-in was cancelled.');
    }
    throw error;
  }
}

export async function refreshAccountSessionIfNeeded(
  session: AccountSession,
): Promise<AccountSession | null> {
  if (!session.accessToken || session.invalidatedAt) return null;
  if (!isAccountSessionNearExpiry(session)) return session;

  if (!session.refreshToken) {
    await accountSessionStore.invalidate('refresh_missing');
    return null;
  }

  const { apiKey } = getFirebaseClientConfig();
  const response = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`,
    },
  );

  const data = (await response.json().catch(() => ({}))) as FirebaseRefreshResponse;
  if (!response.ok || !data.id_token || !data.refresh_token) {
    await accountSessionStore.invalidate('refresh_failed');
    return null;
  }

  const refreshed: AccountSession = {
    ...session,
    accessToken: data.id_token,
    refreshToken: data.refresh_token,
    subject: data.user_id ?? session.subject,
    issuer: FIREBASE_ISSUER,
    expiresAt: expiresAtFromSeconds(data.expires_in),
    provider: session.provider ?? 'firebase_google',
  };
  await accountSessionStore.set(refreshed);
  return refreshed;
}

export async function getUsableAccountSessionWithFreshToken(): Promise<AccountSession | null> {
  const session = await accountSessionStore.getUsable();
  if (!session) return null;
  return refreshAccountSessionIfNeeded(session);
}

export async function signOutFromGoogle(): Promise<void> {
  configureGoogleSignIn();
  const { GoogleSignin } = getGoogleSignInModule();
  await GoogleSignin.signOut().catch(() => undefined);
  await accountSessionStore.clear();
}
