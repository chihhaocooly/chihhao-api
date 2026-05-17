import { AdminUserDto, User } from '@chihhaocooly/chihhao-package';

export const toAdminUserDto = (user: User): AdminUserDto => ({
  id: user.id,
  firebaseUid: user.firebaseUid,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  status: user.status,
  createdAt: user.createdAt ?? null,
  updatedAt: user.updatedAt ?? null,
  lastLoginAt: user.lastLoginAt ?? null,
});
