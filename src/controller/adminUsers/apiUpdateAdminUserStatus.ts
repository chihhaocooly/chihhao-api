import { Request, Response } from 'express';
import { UpdateUserStatusRequest, UserRepository, UserStatus } from '@chihhaocooly/chihhao-package';

const userStatuses: UserStatus[] = ['active', 'disabled', 'pending'];

const apiUpdateAdminUserStatus = async (req: Request, res: Response): Promise<void> => {
  const payload = req.body as Partial<UpdateUserStatusRequest>;

  if (!payload.status || !userStatuses.includes(payload.status)) {
    res.status(400).json({ statusCode: 400, statusMsg: 'Invalid status' });
    return;
  }

  const userRepository = new UserRepository();
  const user = await userRepository.findById(req.params.id);

  if (!user) {
    res.status(404).json({ statusCode: 404, statusMsg: 'User not found' });
    return;
  }

  user.status = payload.status;
  const savedUser = await userRepository.save(user);

  res.json({ id: savedUser.id, status: savedUser.status });
};

export default apiUpdateAdminUserStatus;
