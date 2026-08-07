import { Request, Response, NextFunction } from 'express';
import { getFirebaseAuth } from '../firebase/getFirebaseAuth';
import { UserRepository } from '@chihhaocooly/chihhao-package';
import { isLoginProviderAllowed, readBackofficeUserClaims, syncUserClaims } from '../firebase/userClaims';

export const auth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const firebaseAuth = getFirebaseAuth();
  const idToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length)
    : undefined;

  if (!idToken) {
    res.status(401).json({ statusCode: 401, statusMsg: 'Unauthorized' });
    return;
  }

  try {
    const decodedToken = await firebaseAuth.verifyIdToken(idToken, true);
    const claims = readBackofficeUserClaims(decodedToken);
    const signInProvider = decodedToken.firebase.sign_in_provider;

    if (claims) {
      if (claims.status !== 'active' || !isLoginProviderAllowed(claims.loginMethod, signInProvider)) {
        res.status(403).json({ statusCode: 403, statusMsg: 'Forbidden' });
        return;
      }

      req.authContext = {
        uid: decodedToken.uid,
        email: decodedToken.email ?? '',
        userId: claims.userId,
        role: claims.role,
        status: claims.status,
        loginMethod: claims.loginMethod,
      };

      return next();
    }

    const userRepository = new UserRepository();
    const user = await userRepository.findByFirebaseUid(decodedToken.uid);

    if (!user || user.status !== 'active' || !isLoginProviderAllowed(user.loginMethod, signInProvider)) {
      res.status(403).json({ statusCode: 403, statusMsg: 'Forbidden' });
      return;
    }

    await syncUserClaims(user);

    req.authContext = {
      uid: decodedToken.uid,
      email: decodedToken.email ?? user.email,
      userId: user.id,
      role: user.role,
      status: user.status,
      loginMethod: user.loginMethod,
    };

    return next();
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(401).json({ statusCode: 401, statusMsg: 'Unauthorized' });
    return;
  }
};
