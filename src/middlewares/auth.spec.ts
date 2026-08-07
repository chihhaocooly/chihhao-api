import { Request, Response, NextFunction } from 'express';
import { getFirebaseAuth } from '../firebase/getFirebaseAuth';
import { auth } from './auth';

jest.mock('../firebase/getFirebaseAuth', () => ({
  getFirebaseAuth: jest.fn(),
}));

jest.mock('@chihhaocooly/chihhao-package', () => ({
  UserRepository: jest.fn(),
}));

const getFirebaseAuthMock = getFirebaseAuth as jest.MockedFunction<typeof getFirebaseAuth>;

describe('auth middleware', () => {
  const verifyIdToken = jest.fn();
  const next: NextFunction = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getFirebaseAuthMock.mockReturnValue({
      verifyIdToken,
    } as unknown as ReturnType<typeof getFirebaseAuth>);
  });

  it('returns 401 when bearer token is missing', async () => {
    const req = { headers: {} } as Request;
    const res = createResponse();

    await auth(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 401, statusMsg: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts active users with matching custom claims and provider', async () => {
    const req = {
      headers: {
        authorization: 'Bearer id-token',
      },
    } as Request;
    const res = createResponse();

    verifyIdToken.mockResolvedValue({
      uid: 'firebase-uid',
      email: 'admin@example.com',
      userId: 'db-user-id',
      role: 'admin',
      status: 'active',
      loginMethod: 'google_sso',
      firebase: {
        sign_in_provider: 'google.com',
      },
    });

    await auth(req, res as unknown as Response, next);

    expect(verifyIdToken).toHaveBeenCalledWith('id-token', true);
    expect(req.authContext).toEqual({
      uid: 'firebase-uid',
      email: 'admin@example.com',
      userId: 'db-user-id',
      role: 'admin',
      status: 'active',
      loginMethod: 'google_sso',
    });
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when status claim is not active', async () => {
    const req = {
      headers: {
        authorization: 'Bearer id-token',
      },
    } as Request;
    const res = createResponse();

    verifyIdToken.mockResolvedValue({
      uid: 'firebase-uid',
      userId: 'db-user-id',
      role: 'viewer',
      status: 'disabled',
      loginMethod: 'password',
      firebase: {
        sign_in_provider: 'password',
      },
    });

    await auth(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 403, statusMsg: 'Forbidden' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when login method does not match provider', async () => {
    const req = {
      headers: {
        authorization: 'Bearer id-token',
      },
    } as Request;
    const res = createResponse();

    verifyIdToken.mockResolvedValue({
      uid: 'firebase-uid',
      userId: 'db-user-id',
      role: 'viewer',
      status: 'active',
      loginMethod: 'password',
      firebase: {
        sign_in_provider: 'google.com',
      },
    });

    await auth(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 403, statusMsg: 'Forbidden' });
    expect(next).not.toHaveBeenCalled();
  });
});

const createResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  return res;
};
