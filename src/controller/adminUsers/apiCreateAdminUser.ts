import { Request, Response } from 'express';
import { FirebaseAuthError } from 'firebase-admin/auth';
import { BackofficeUserRole, CreateAdminUserRequest, User, UserRepository } from '@chihhaocooly/chihhao-package';
import { getFirebaseAuth } from '../../firebase/getFirebaseAuth';
import { toAdminUserDto } from './adminUserMapper';

const backofficeRoles: BackofficeUserRole[] = ['admin', 'manager', 'viewer'];

const apiCreateAdminUser = async (req: Request, res: Response): Promise<void> => {
  const payload = req.body as Partial<CreateAdminUserRequest>;

  if (!payload.email || !payload.password || !payload.role || !backofficeRoles.includes(payload.role)) {
    res.status(400).json({ statusCode: 400, statusMsg: 'Invalid request' });
    return;
  }

  const firebaseAuth = getFirebaseAuth();
  let firebaseUser;

  try {
    firebaseUser = await firebaseAuth.createUser({
      email: payload.email,
      password: payload.password,
      displayName: payload.displayName,
    });
  } catch (error) {
    if (isEmailAlreadyExistsError(error)) {
      firebaseUser = await firebaseAuth.getUserByEmail(payload.email);
    } else {
      throw error;
    }
  }

  const userRepository = new UserRepository();
  const existingUser = await userRepository.findByFirebaseUid(firebaseUser.uid);
  const user = existingUser ?? new User();

  user.firebaseUid = firebaseUser.uid;
  user.email = firebaseUser.email ?? payload.email;
  user.displayName = payload.displayName ?? firebaseUser.displayName ?? null;
  user.role = payload.role;
  user.status = 'active';

  const savedUser = await userRepository.save(user);

  res.status(existingUser ? 200 : 201).json(toAdminUserDto(savedUser));
};

const isEmailAlreadyExistsError = (error: unknown): error is FirebaseAuthError => {
  return error instanceof FirebaseAuthError && error.code === 'auth/email-already-exists';
};

export default apiCreateAdminUser;
