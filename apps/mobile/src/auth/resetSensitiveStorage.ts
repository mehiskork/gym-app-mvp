import { accountSessionStore } from './accountSessionStore';
import { deviceCredentialStore } from './deviceCredentialStore';

export async function clearSensitiveAuthStorage(): Promise<void> {
    await Promise.all([deviceCredentialStore.clear(), accountSessionStore.clear()]);
}