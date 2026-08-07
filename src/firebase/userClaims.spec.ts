import { DecodedIdToken } from 'firebase-admin/auth';
import { User } from '@chihhaocooly/chihhao-package';
import { getFirebaseAuth } from './getFirebaseAuth';
import { isLoginProviderAllowed, readBackofficeUserClaims, syncUserClaims } from './userClaims';

jest.mock('./getFirebaseAuth', () => ({
  getFirebaseAuth: jest.fn(),
}));

const getFirebaseAuthMock = getFirebaseAuth as jest.MockedFunction<typeof getFirebaseAuth>;

describe('userClaims', () => {
  const setCustomUserClaims = jest.fn();
  const revokeRefreshTokens = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getFirebaseAuthMock.mockReturnValue({
      setCustomUserClaims,
      revokeRefreshTokens,
    } as unknown as ReturnType<typeof getFirebaseAuth>);
  });

  it('syncs role, status, login method and user id into Firebase custom claims', async () => {
    const user = {
      id: 'db-user-id',
      firebaseUid: 'firebase-uid',
      role: 'admin',
      status: 'active',
      loginMethod: 'google_sso',
    } as User;

    await syncUserClaims(user);

    expect(setCustomUserClaims).toHaveBeenCalledWith('firebase-uid', {
      userId: 'db-user-id',
      role: 'admin',
      status: 'active',
      loginMethod: 'google_sso',
    });
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('revokes refresh tokens when requested', async () => {
    const user = {
      id: 'db-user-id',
      firebaseUid: 'firebase-uid',
      role: 'viewer',
      status: 'disabled',
      loginMethod: 'password',
    } as User;

    await syncUserClaims(user, { revokeRefreshTokens: true });

    expect(revokeRefreshTokens).toHaveBeenCalledWith('firebase-uid');
  });

  it('reads valid backoffice claims from a decoded token', () => {
    const claims = readBackofficeUserClaims({
      userId: 'db-user-id',
      role: 'manager',
      status: 'active',
      loginMethod: 'password',
    } as unknown as DecodedIdToken);

    expect(claims).toEqual({
      userId: 'db-user-id',
      role: 'manager',
      status: 'active',
      loginMethod: 'password',
    });
  });

  it('rejects invalid backoffice claims', () => {
    const claims = readBackofficeUserClaims({
      userId: 'db-user-id',
      role: 'owner',
      status: 'active',
      loginMethod: 'password',
    } as unknown as DecodedIdToken);

    expect(claims).toBeNull();
  });

  it('matches login methods to Firebase sign-in providers', () => {
    expect(isLoginProviderAllowed('google_sso', 'google.com')).toBe(true);
    expect(isLoginProviderAllowed('google_sso', 'password')).toBe(false);
    expect(isLoginProviderAllowed('password', 'password')).toBe(true);
    expect(isLoginProviderAllowed('password', 'google.com')).toBe(false);
  });
});
