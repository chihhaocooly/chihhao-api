import { Request, Response, NextFunction } from 'express';
import { getFirebaseAuth } from '../firebase/getFirebaseAuth';
import { verifyGoogleAccessToken } from './verifyGoogleAccessToken';

export const auth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  console.log('headers =>', JSON.stringify(req.headers));
  console.log('body =>', JSON.stringify(req.body));

  const auth = getFirebaseAuth();
  const idToken = req.headers.authorization?.split('Bearer ')[1]; // 確保提取 Bearer token

  if (!idToken) {
    res.status(401).send('Unauthorized');
    return; // 明確地返回
  }

  try {
    if (isFirebaseIdToken(idToken)) {
      const decodedToken = await auth.verifyIdToken(idToken, true);

      console.log('decodedToken =>', JSON.stringify(decodedToken));
      req.body.uid = decodedToken.uid;
    } else {
      await verifyGoogleAccessToken(idToken);
    }
    return next(); // 確保 next() 在成功的情況下被執行
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(401).send('Unauthorized'); // 處理驗證錯誤
    return;
  }
};

function isFirebaseIdToken(token: string): boolean {
  // Firebase ID Token 是 JWT，必須包含兩個 `.` 分隔符
  return token.split('.').length === 3;
}
