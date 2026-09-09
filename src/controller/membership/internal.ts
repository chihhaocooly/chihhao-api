import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { MyError } from '../../@types/my-error';
import { processMemberMenus } from '../../functions/membership/memberMenuWorker';

const router = Router();
const verifier = new OAuth2Client();
router.post('/member-menu-sync/process', async (req, res) => {
  const audience = process.env.MEMBER_MENU_SYNC_AUDIENCE;
  const email = process.env.MEMBER_MENU_SYNC_SERVICE_ACCOUNT;
  if (!audience || !email) throw new MyError(503, '會員選單排程尚未設定');
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new MyError(401, '排程認證失敗');
  try {
    const ticket = await verifier.verifyIdToken({ idToken: token, audience });
    const claims = ticket.getPayload();
    if (
      !claims ||
      !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) ||
      claims.email !== email ||
      !claims.email_verified
    )
      throw new Error('invalid');
  } catch {
    throw new MyError(401, '排程認證失敗');
  }
  res.json(await processMemberMenus());
});
export default router;
