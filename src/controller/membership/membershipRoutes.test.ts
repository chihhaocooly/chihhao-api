import 'express-async-errors';
import express from 'express';
import axios from 'axios';
import { Server } from 'http';
import { AddressInfo } from 'net';
import router from './index';
import usersRouter from '../adminUsers';
import { MemberConfigurationService } from '../../functions/membership/memberConfigurationService';
import { errorHandler } from '../../middlewares/error-handler';
let server: Server;
let url: string;
beforeAll(async () => {
  jest.spyOn(MemberConfigurationService.prototype, 'identities').mockResolvedValue({ items: [] });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.header('x-test-role');
    if (role) req.authContext = { role } as Express.AuthContext;
    next();
  });
  app.use('/admin', usersRouter);
  app.use('/admin', router);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/member-identities`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  jest.restoreAllMocks();
});
test.each(['admin', 'manager', 'viewer'])('實際掛載順序允許 %s 讀取設定', async (role) => {
  const response = await axios.get(url, { headers: { 'x-test-role': role }, proxy: false, validateStatus: () => true });
  expect(response.status).toBe(200);
});
test.each([
  ['viewer', 403],
  ['', 401],
  ['member', 403],
])('拒絕 %s 寫入', async (role, status) => {
  const response = await axios.post(
    url,
    { name: '金卡' },
    { headers: { 'x-test-role': role }, proxy: false, validateStatus: () => true }
  );
  expect(response.status).toBe(status);
});
