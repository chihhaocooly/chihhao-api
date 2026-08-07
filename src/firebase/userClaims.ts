import { DecodedIdToken } from 'firebase-admin/auth';
import { LoginMethod, User, UserRole, UserStatus } from '@chihhaocooly/chihhao-package';
import { getFirebaseAuth } from './getFirebaseAuth';

export interface BackofficeUserClaims {
  userId: string;
  role: UserRole;
  status: UserStatus;
  loginMethod: LoginMethod;
}

const userRoles: UserRole[] = ['admin', 'manager', 'viewer', 'front_user'];
const userStatuses: UserStatus[] = ['active', 'disabled', 'pending'];
const loginMethods: LoginMethod[] = ['google_sso', 'password'];

export const syncUserClaims = async (
  user: User,
  options: { revokeRefreshTokens?: boolean } = {},
): Promise<void> => {
  const firebaseAuth = getFirebaseAuth();

  await firebaseAuth.setCustomUserClaims(user.firebaseUid, toBackofficeUserClaims(user));

  if (options.revokeRefreshTokens) {
    await firebaseAuth.revokeRefreshTokens(user.firebaseUid);
  }
};

export const readBackofficeUserClaims = (decodedToken: DecodedIdToken): BackofficeUserClaims | null => {
  const userId = decodedToken['userId'];
  const role = decodedToken['role'];
  const status = decodedToken['status'];
  const loginMethod = decodedToken['loginMethod'];

  if (
    typeof userId !== 'string' ||
    !isUserRole(role) ||
    !isUserStatus(status) ||
    !isLoginMethod(loginMethod)
  ) {
    return null;
  }

  return {
    userId,
    role,
    status,
    loginMethod,
  };
};

export const isLoginProviderAllowed = (loginMethod: LoginMethod, provider: string | undefined): boolean => {
  if (loginMethod === 'google_sso') {
    return provider === 'google.com';
  }

  return provider === 'password';
};

const toBackofficeUserClaims = (user: User): BackofficeUserClaims => ({
  userId: user.id,
  role: user.role,
  status: user.status,
  loginMethod: user.loginMethod,
});

const isUserRole = (value: unknown): value is UserRole => {
  return typeof value === 'string' && userRoles.includes(value as UserRole);
};

const isUserStatus = (value: unknown): value is UserStatus => {
  return typeof value === 'string' && userStatuses.includes(value as UserStatus);
};

const isLoginMethod = (value: unknown): value is LoginMethod => {
  return typeof value === 'string' && loginMethods.includes(value as LoginMethod);
};
