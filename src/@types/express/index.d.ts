import { UserRole, UserStatus } from '@chihhaocooly/chihhao-package';

declare global {
  namespace Express {
    interface AuthContext {
      uid: string;
      email: string;
      userId: string;
      role: UserRole;
      status: UserStatus;
    }

    interface Request {
      authContext?: AuthContext;
    }
  }
}
