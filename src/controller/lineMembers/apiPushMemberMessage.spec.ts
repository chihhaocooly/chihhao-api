import 'express-async-errors';
import express from 'express';
import axios from 'axios';
import { Server } from 'http';
import { AddressInfo } from 'net';
import lineMembersRouter from './index';
import lineMessageRouter from '../lineMessage';
import { LineMemberPushService } from '../../functions/lineMembers/lineMemberPushService';
import { validateSavedLineMessage } from '../../functions/lineMessage/validateSavedLineMessage';

jest.mock('../../functions/lineMembers/lineMemberPushService');
jest.mock('../../functions/lineMessage/validateSavedLineMessage');
const body = { lineMessageKey: '0ef8a85b-2e50-4d3a-a21b-7e7be2b922a1', retryKey: '5afccff7-9de3-41f7-a238-dc6ecdc966d4' };

describe('member push routes authorization', () => {
  let server: Server;
  let baseUrl: string;
  const push = jest.fn();
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const role = req.header('x-test-role');
      if (role) req.authContext = { role } as Express.AuthContext;
      next();
    });
    app.use('/line-members', lineMembersRouter);
    app.use('/lineMessage', lineMessageRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  beforeEach(() => {
    jest.clearAllMocks();
    (LineMemberPushService as jest.Mock).mockImplementation(() => ({ pushMessage: push }));
    push.mockResolvedValue({ status: 'accepted' });
    (validateSavedLineMessage as jest.Mock).mockResolvedValue({ isValid: true, isSendable: true, summary: 'ok', fieldErrors: [], normalized: { private: true } });
  });
  const request = (path: string, role: string) => axios.post(`${baseUrl}${path}`, body, {
    headers: role ? { 'x-test-role': role } : {}, validateStatus: () => true, proxy: false,
  });
  for (const path of [`/line-members/${body.lineMessageKey}/push-message`, `/lineMessage/${body.lineMessageKey}/validate`]) {
    it.each(['admin', 'manager'])(`${path} allows %s`, async (role) => {
      const response = await request(path, role);
      expect(response.status).toBe(200);
      if (path.startsWith('/line-members')) {
        expect(push).toHaveBeenCalledWith(body.lineMessageKey, body);
        expect(response.data).toEqual({ status: 'accepted' });
      } else {
        expect(response.data).toEqual({ isValid: true, isSendable: true, summary: 'ok', fieldErrors: [] });
      }
    });
    it.each([['', 401], ['viewer', 403], ['front_user', 403]])(`${path} rejects %s`, async (role, status) => {
      expect((await request(path, String(role))).status).toBe(status);
      expect(push).not.toHaveBeenCalled();
      expect(validateSavedLineMessage).not.toHaveBeenCalled();
    });
  }
});
