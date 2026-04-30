import { getSettingsAccountUiState } from '../settingsAccountUiState';

describe('Settings account UI state', () => {
  it('shows account creation only for true guest mode', () => {
    expect(getSettingsAccountUiState('guest', null)).toEqual({
      accountLabel: 'Guest',
      showGuestCreate: true,
      showAccountActions: false,
      showReauthRequired: false,
      showReconnect: false,
      reauthMessage: null,
    });
  });

  it('shows signed-in state for linked account mode', () => {
    expect(
      getSettingsAccountUiState('linked_with_usable_account', {
        accessToken: 'account-jwt',
        email: 'user@example.test',
      }),
    ).toEqual({
      accountLabel: 'user@example.test',
      showGuestCreate: false,
      showAccountActions: true,
      showReauthRequired: false,
      showReconnect: false,
      reauthMessage: null,
    });
  });

  it('does not expose guest account creation when linked state needs reauth', () => {
    expect(getSettingsAccountUiState('linked_reauth_required', null)).toEqual({
      accountLabel: 'Account session expired',
      showGuestCreate: false,
      showAccountActions: false,
      showReauthRequired: true,
      showReconnect: true,
      reauthMessage: 'Reconnect with Google to sync this device again.',
    });
  });
});
