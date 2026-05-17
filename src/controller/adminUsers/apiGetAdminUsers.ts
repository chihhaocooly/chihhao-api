import { Request, Response } from 'express';
import { UserRepository } from '@chihhaocooly/chihhao-package';
import { toAdminUserDto } from './adminUserMapper';

const apiGetAdminUsers = async (_req: Request, res: Response): Promise<void> => {
  const userRepository = new UserRepository();
  const users = await userRepository.findAll();

  res.json(users.map(toAdminUserDto));
};

export default apiGetAdminUsers;
