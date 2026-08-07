import { Request, Response } from 'express';
import { FirebaseAuthError } from 'firebase-admin/auth';
import {
  BackofficeUserRole,
  CreateAdminUserRequest,
  LoginMethod,
  User,
  UserRepository,
} from '@chihhaocooly/chihhao-package';
import { getFirebaseAuth } from '../../firebase/getFirebaseAuth';
import { toAdminUserDto } from './adminUserMapper';
import { syncUserClaims } from '../../firebase/userClaims';

const backofficeRoles: BackofficeUserRole[] = ['admin', 'manager', 'viewer'];
const loginMethods: LoginMethod[] = ['google_sso', 'password'];

const apiCreateAdminUser = async (req: Request, res: Response): Promise<void> => {
  const payload = req.body as Partial<CreateAdminUserRequest>;
  const email = payload.email?.trim().toLowerCase();
  const displayName = payload.displayName?.trim() || undefined;

  if (!email || !payload.role || !backofficeRoles.includes(payload.role) || !payload.loginMethod || !loginMethods.includes(payload.loginMethod)) {
    res.status(400).json({ statusCode: 400, statusMsg: 'Invalid request' });
    return;
  }

  if (payload.loginMethod === 'password' && !payload.password) {
    res.status(400).json({ statusCode: 400, statusMsg: 'Password is required' });
    return;
  }

  const firebaseAuth = getFirebaseAuth();
  let firebaseUser;

  try {
    firebaseUser = await firebaseAuth.createUser({
      email,
      ...(payload.loginMethod === 'password' ? { password: payload.password } : {}),
      displayName,
    });
  } catch (error) {
    if (isEmailAlreadyExistsError(error)) {
      firebaseUser = await firebaseAuth.getUserByEmail(email);
    } else {
      throw error;
    }
  }

  const userRepository = new UserRepository();
  const existingUser = await userRepository.findByFirebaseUid(firebaseUser.uid) ?? await userRepository.findByEmail(email);
  const user = existingUser ?? new User();

  user.firebaseUid = firebaseUser.uid;
  user.email = firebaseUser.email ?? email;
  user.displayName = displayName ?? firebaseUser.displayName ?? null;
  user.role = payload.role;
  user.status = 'active';
  user.loginMethod = payload.loginMethod;

  const savedUser = await userRepository.save(user);
  await syncUserClaims(savedUser, { revokeRefreshTokens: !!existingUser });

  res.status(existingUser ? 200 : 201).json(toAdminUserDto(savedUser));
};

const isEmailAlreadyExistsError = (error: unknown): error is FirebaseAuthError => {
  return error instanceof FirebaseAuthError && error.code === 'auth/email-already-exists';
};

export default apiCreateAdminUser;
