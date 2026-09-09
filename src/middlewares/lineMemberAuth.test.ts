import { Request, Response } from 'express';
import { lineMemberAuth } from './lineMemberAuth';
import { getFirebaseAuth } from '../firebase/getFirebaseAuth';
jest.mock('../firebase/getFirebaseAuth', () => ({ getFirebaseAuth: jest.fn() }));
const verify = jest.fn();
beforeEach(() => {
  (getFirebaseAuth as jest.Mock).mockReturnValue({ verifyIdToken: verify });
});
test('以已驗證 claim 識別會員，忽略偽造的 userId', async () => {
  verify.mockResolvedValue({ provider: 'line', site: 'chihhao', lineUserId: `U${'a'.repeat(32)}` });
  const req = { headers: { authorization: 'Bearer token' }, body: { userId: 'forged' } } as Request;
  const next = jest.fn();
  await lineMemberAuth(req, {} as Response, next);
  expect(req.lineMemberId).toBe(`U${'a'.repeat(32)}`);
  expect(verify).toHaveBeenCalledWith('token', true);
  expect(next).toHaveBeenCalled();
});
test.each([{ provider: 'password' }, { provider: 'line', site: 'other', lineUserId: `U${'a'.repeat(32)}` }])(
  '拒絕非 LINE 或不同站台 token',
  async (claims) => {
    verify.mockResolvedValue(claims);
    await expect(
      lineMemberAuth({ headers: { authorization: 'Bearer token' } } as Request, {} as Response, jest.fn())
    ).rejects.toMatchObject({ statusCode: 401 });
  }
);
