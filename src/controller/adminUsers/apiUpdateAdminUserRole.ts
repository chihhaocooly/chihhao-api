import { Request, Response } from 'express';
import { BackofficeUserRole, UpdateUserRoleRequest, UserRepository } from '@chihhaocooly/chihhao-package';
import { syncUserClaims } from '../../firebase/userClaims';

const backofficeRoles: BackofficeUserRole[] = ['admin', 'manager', 'viewer'];

const apiUpdateAdminUserRole = async (req: Request, res: Response): Promise<void> => {
  const payload = req.body as Partial<UpdateUserRoleRequest>;

  if (!payload.role || !backofficeRoles.includes(payload.role)) {
    res.status(400).json({ statusCode: 400, statusMsg: 'Invalid role' });
    return;
  }

  const userRepository = new UserRepository();
  const user = await userRepository.findById(req.params.id);

  if (!user) {
    res.status(404).json({ statusCode: 404, statusMsg: 'User not found' });
    return;
  }

  user.role = payload.role;
  const savedUser = await userRepository.save(user);
  await syncUserClaims(savedUser, { revokeRefreshTokens: true });

  res.json({ id: savedUser.id, role: savedUser.role });
};

export default apiUpdateAdminUserRole;
