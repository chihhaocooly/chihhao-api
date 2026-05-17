import { NextFunction, Request, Response } from 'express';
import { UserRole } from '@chihhaocooly/chihhao-package';

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authContext = req.authContext;

    if (!authContext) {
      res.status(401).json({ statusCode: 401, statusMsg: 'Unauthorized' });
      return;
    }

    if (!allowedRoles.includes(authContext.role)) {
      res.status(403).json({ statusCode: 403, statusMsg: 'Forbidden' });
      return;
    }

    next();
  };
};
