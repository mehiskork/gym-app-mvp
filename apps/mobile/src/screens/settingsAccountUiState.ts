import type { AccountSession } from '../auth/accountSessionStore';
import type { LocalAccountStateStatus } from '../auth/localAccountState';

export type SettingsAccountUiState = {
  accountLabel: string;
  showGuestCreate: boolean;
  showAccountActions: boolean;
  showReauthRequired: boolean;
};

export function getSettingsAccountUiState(
  localAccountState: LocalAccountStateStatus,
  accountSession: AccountSession | null,
): SettingsAccountUiState {
  if (localAccountState === 'linked_with_usable_account') {
    return {
      accountLabel: accountSession?.email ?? 'Signed in',
      showGuestCreate: false,
      showAccountActions: true,
      showReauthRequired: false,
    };
  }

  if (localAccountState === 'linked_reauth_required') {
    return {
      accountLabel: 'Linked - reauth required',
      showGuestCreate: false,
      showAccountActions: true,
      showReauthRequired: true,
    };
  }

  return {
    accountLabel: 'Guest',
    showGuestCreate: true,
    showAccountActions: false,
    showReauthRequired: false,
  };
}
