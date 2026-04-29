import { isLinkedAccountState } from '../db/appMetaRepo';
import { accountSessionStore, type AccountSession } from './accountSessionStore';

export type LocalAccountState =
  | { status: 'guest'; accountSession: null }
  | { status: 'linked_with_usable_account'; accountSession: AccountSession }
  | { status: 'linked_reauth_required'; accountSession: null };

export type LocalAccountStateStatus = LocalAccountState['status'];

export function resolveLocalAccountStateFromSession(
  accountSession: AccountSession | null,
): LocalAccountState {
  if (accountSession?.accessToken) {
    return { status: 'linked_with_usable_account', accountSession };
  }

  if (isLinkedAccountState()) {
    return { status: 'linked_reauth_required', accountSession: null };
  }

  return { status: 'guest', accountSession: null };
}

export async function resolveLocalAccountState(): Promise<LocalAccountState> {
  return resolveLocalAccountStateFromSession(await accountSessionStore.getUsable());
}
