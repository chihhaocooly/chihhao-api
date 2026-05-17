import { Request, Response } from 'express';
import { AuthMeResponse, UserRepository } from '@chihhaocooly/chihhao-package';

const apiGetMe = async (req: Request, res: Response): Promise<void> => {
  const authContext = req.authContext;

  if (!authContext) {
    res.status(401).json({ statusCode: 401, statusMsg: 'Unauthorized' });
    return;
  }

  const userRepository = new UserRepository();
  const user = await userRepository.findById(authContext.userId);

  if (!user || user.status !== 'active') {
    res.status(403).json({ statusCode: 403, statusMsg: 'Forbidden' });
    return;
  }

  user.lastLoginAt = new Date();
  await userRepository.save(user);

  const response: AuthMeResponse = {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
  };

  res.json(response);
};

export default apiGetMe;
