import 'express-async-errors';
import express from 'express';
import axios from 'axios';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { AppDataSource } from '@chihhaocooly/chihhao-package';
import adminSurveysRouter from './index';
import { errorHandler } from '../../middlewares/error-handler';

jest.mock('@chihhaocooly/chihhao-package', () => ({ AppDataSource: { query: jest.fn() } }));

const surveyKey = '0ef8a85b-2e50-4d3a-a21b-7e7be2b922a1';
const reportKey = '5afccff7-9de3-41f7-a238-dc6ecdc966d4';
const otherSurveyKey = '7afccff7-9de3-41f7-a238-dc6ecdc966d4';
const answers = [{ questionId: 'choice', type: 'checkbox', answer: ['A', '其他'], extraText: { 其他: '完整補充' } }];

describe('GET admin survey report', () => {
  let server: Server;
  let baseUrl: string;
  const query = AppDataSource.query as jest.Mock;
  let errorLog: jest.SpyInstance;

  beforeAll(async () => {
    const app = express();
    // 測試從認證 middleware 的輸出開始，角色限制使用正式 router。
    app.use((req, _res, next) => {
      const role = req.header('x-test-role');
      if (role) req.authContext = { role } as Express.AuthContext;
      next();
    });
    app.use('/admin/surveys', adminSurveysRouter);
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/surveys`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  beforeEach(() => {
    errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    query.mockReset().mockImplementation(async (sql: string, params: string[]) => {
      if (sql.includes('FROM survey_report')) {
        return params[0] === surveyKey && params[1] === reportKey
          ? [{ reportKey, surveyKey, lineUserId: 'U1', displayName: '填寫者', answers, submittedAt: '2026-09-07T00:00:00Z' }]
          : [];
      }
      return [{ surveyKey: params[0], title: '問卷', questions: [{ id: 'choice', title: '選擇題', type: 'checkbox', required: false }] }];
    });
  });
  afterEach(() => errorLog.mockRestore());

  const request = (survey = surveyKey, report = reportKey, role = 'viewer') =>
    axios.get(`${baseUrl}/${survey}/reports/${report}`, { headers: role ? { 'x-test-role': role } : {}, validateStatus: () => true, proxy: false });

  it.each(['admin', 'manager', 'viewer'])('allows %s and returns the complete DTO', async (role) => {
    const response = await request(surveyKey, reportKey, role);
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ item: {
      reportKey, surveyId: surveyKey, surveyTitle: '問卷', displayName: '填寫者', lineUserId: 'U1',
      submittedAt: '2026-09-07T00:00:00.000Z', answers: [{ ...answers[0], questionTitle: '選擇題' }],
    } });
    expect(query).toHaveBeenLastCalledWith(expect.stringMatching(/WHERE surveyKey = \? AND reportKey = \?/), [surveyKey, reportKey]);
    expect(query.mock.calls[0][0]).toContain('survey.deletedAt IS NULL');
  });
  it.each([['', 401], ['member', 403]])('rejects unauthorized role %s', async (role, status) => {
    expect((await request(surveyKey, reportKey, String(role))).status).toBe(status);
    expect(query).not.toHaveBeenCalled();
  });
  it.each([['invalid', reportKey], [surveyKey, 'invalid']])('rejects invalid UUIDs before querying', async (survey, report) => {
    expect((await request(survey, report)).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it('returns 404 for a missing survey', async () => {
    query.mockResolvedValue([]);
    expect((await request()).status).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('returns 404 for a missing report', async () => {
    expect((await request(surveyKey, otherSurveyKey)).status).toBe(404);
  });
  it('does not return a report belonging to another survey', async () => {
    expect((await request(otherSurveyKey, reportKey)).status).toBe(404);
    expect(query).toHaveBeenLastCalledWith(expect.any(String), [otherSurveyKey, reportKey]);
  });
});
