import { RequestHandler } from 'express';
import { getFirebaseAuth } from '../firebase/getFirebaseAuth';
import { MyError } from '../@types/my-error';

export const lineMemberAuth: RequestHandler = async (req, _res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new MyError(401, '請先登入 LINE');
  try {
    const claims = await getFirebaseAuth().verifyIdToken(token, true);
    if (
      claims.provider !== 'line' ||
      claims.site !== (process.env.LIFF_SITE ?? 'chihhao') ||
      typeof claims.lineUserId !== 'string' ||
      !/^U[0-9a-f]{32}$/.test(claims.lineUserId)
    ) {
      throw new MyError(401, 'LINE 登入資訊不正確');
    }
    req.lineMemberId = claims.lineUserId;
  } catch {
    throw new MyError(401, 'LINE 登入已失效，請重新登入');
  }
  next();
};
