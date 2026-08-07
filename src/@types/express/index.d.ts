import { LoginMethod, UserRole, UserStatus } from '@chihhaocooly/chihhao-package';

declare global {
  namespace Express {
    interface AuthContext {
      uid: string;
      email: string;
      userId: string;
      role: UserRole;
      status: UserStatus;
      loginMethod: LoginMethod;
    }

    interface Request {
      authContext?: AuthContext;
    }
  }
}
