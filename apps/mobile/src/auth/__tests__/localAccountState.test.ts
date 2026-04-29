import {
  resolveLocalAccountState,
  resolveLocalAccountStateFromSession,
} from '../localAccountState';
import { isLinkedAccountState } from '../../db/appMetaRepo';
import { accountSessionStore } from '../accountSessionStore';

jest.mock('../../db/appMetaRepo', () => ({
  isLinkedAccountState: jest.fn(() => false),
}));

jest.mock('../accountSessionStore', () => ({
  accountSessionStore: {
    getUsable: jest.fn(),
  },
}));

describe('local account state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isLinkedAccountState as jest.Mock).mockReturnValue(false);
    (accountSessionStore.getUsable as jest.Mock).mockResolvedValue(null);
  });

  it('classifies true guest mode', () => {
    expect(resolveLocalAccountStateFromSession(null)).toEqual({
      status: 'guest',
      accountSession: null,
    });
  });

  it('classifies linked state with a usable account session', () => {
    const session = { accessToken: 'account-jwt', email: 'user@example.test' };

    expect(resolveLocalAccountStateFromSession(session)).toEqual({
      status: 'linked_with_usable_account',
      accountSession: session,
    });
  });

  it('classifies linked state without usable account auth as reauth required', () => {
    (isLinkedAccountState as jest.Mock).mockReturnValue(true);

    expect(resolveLocalAccountStateFromSession(null)).toEqual({
      status: 'linked_reauth_required',
      accountSession: null,
    });
  });

  it('reads the usable session from SecureStore-backed account storage', async () => {
    (accountSessionStore.getUsable as jest.Mock).mockResolvedValue({
      accessToken: 'account-jwt',
    });

    await expect(resolveLocalAccountState()).resolves.toEqual({
      status: 'linked_with_usable_account',
      accountSession: { accessToken: 'account-jwt' },
    });
  });
});
