const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: mockGetItemAsync,
  setItemAsync: mockSetItemAsync,
  deleteItemAsync: mockDeleteItemAsync,
}));

import {
  clearAccountDeletionCleanupPending,
  isAccountDeletionCleanupPending,
  markAccountDeletionCleanupPending,
} from '../accountDeletionCleanupMarker';

describe('account deletion cleanup marker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue(undefined);
    mockDeleteItemAsync.mockResolvedValue(undefined);
  });

  it('persists only non-sensitive cleanup marker data', async () => {
    await markAccountDeletionCleanupPending();

    expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
    const [, rawValue] = mockSetItemAsync.mock.calls[0];
    const marker = JSON.parse(rawValue);
    expect(marker).toEqual({
      pending: true,
      version: 1,
      markedAt: expect.any(String),
    });
    expect(rawValue).not.toMatch(/accountId|userId|guestUserId|owner|subject|jwt|token|payload/i);
  });

  it('reads and clears the pending marker', async () => {
    mockGetItemAsync.mockResolvedValueOnce('{"pending":true,"version":1}');

    await expect(isAccountDeletionCleanupPending()).resolves.toBe(true);
    await clearAccountDeletionCleanupPending();

    expect(mockDeleteItemAsync).toHaveBeenCalledTimes(1);
  });
});
