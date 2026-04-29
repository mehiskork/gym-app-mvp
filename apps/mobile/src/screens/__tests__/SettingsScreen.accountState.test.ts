import { getSettingsAccountUiState } from '../settingsAccountUiState';

describe('Settings account UI state', () => {
  it('shows account creation only for true guest mode', () => {
    expect(getSettingsAccountUiState('guest', null)).toEqual({
      accountLabel: 'Guest',
      showGuestCreate: true,
      showAccountActions: false,
      showReauthRequired: false,
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
    });
  });

  it('does not expose guest account creation when linked state needs reauth', () => {
    expect(getSettingsAccountUiState('linked_reauth_required', null)).toEqual({
      accountLabel: 'Linked - reauth required',
      showGuestCreate: false,
      showAccountActions: true,
      showReauthRequired: true,
    });
  });
});
