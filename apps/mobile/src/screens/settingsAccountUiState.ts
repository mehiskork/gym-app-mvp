import type { AccountSession } from '../auth/accountSessionStore';
import type { LocalAccountStateStatus } from '../auth/localAccountState';

export type SettingsAccountUiState = {
  accountLabel: string;
  showGuestCreate: boolean;
  showAccountActions: boolean;
  showReauthRequired: boolean;
  showReconnect: boolean;
  reauthMessage: string | null;
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
      showReconnect: false,
      reauthMessage: null,
    };
  }

  if (localAccountState === 'linked_reauth_required') {
    return {
      accountLabel: 'Account session expired',
      showGuestCreate: false,
      showAccountActions: false,
      showReauthRequired: true,
      showReconnect: true,
      reauthMessage: 'Reconnect with Google to sync this device again.',
    };
  }

  return {
    accountLabel: 'Guest',
    showGuestCreate: true,
    showAccountActions: false,
    showReauthRequired: false,
    showReconnect: false,
    reauthMessage: null,
  };
}
