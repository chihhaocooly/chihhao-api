import { Request, Response } from 'express';

const lineWebhookOnRequest = jest.fn(async (_req: Request, res: Response) => {
  res.status(200).end();
});
const ingestWebhook = jest.fn();
const initialize = jest.fn<Promise<void>, []>();
const createDispatcher = jest.fn();
const getMessageApiChannelAccessToken = jest.fn();
const getMessageApiChannelSecret = jest.fn();
const validateSignature = jest.fn();

jest.mock('@chihhaocooly/chihhao-package', () => ({
  LineWebhook: jest.fn().mockImplementation(() => {
    createDispatcher();
    return { init: initialize, lineWebhookOnRequest };
  }),
}));

jest.mock('@line/bot-sdk', () => ({
  Client: jest.fn().mockImplementation((config) => ({ config })),
  validateSignature: (...args: unknown[]) => validateSignature(...args),
}));

jest.mock('../../functions/lineMembers', () => ({
  LineMemberService: jest.fn().mockImplementation(() => ({
    ingestWebhook,
  })),
}));

jest.mock('../../functions/siteSettings', () => ({
  SiteLineSettingsService: jest.fn().mockImplementation(() => ({
    getMessageApiChannelAccessToken,
    getMessageApiChannelSecret,
  })),
}));

let apiLineWebhook: typeof import('./apiLineWebhook').apiLineWebhook;

describe('apiLineWebhook', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    initialize.mockReset().mockResolvedValue(undefined);
    ingestWebhook.mockReset().mockResolvedValue(undefined);
    // 每個案例代表一個新程序，避免前例的 ready 狀態掩蓋首次初始化。
    ({ apiLineWebhook } = require('./apiLineWebhook') as typeof import('./apiLineWebhook'));
    getMessageApiChannelAccessToken.mockResolvedValue('access-token');
    getMessageApiChannelSecret.mockResolvedValue('channel-secret');
    validateSignature.mockReturnValue(true);
  });

  it('validates LINE signature before ingesting and dispatching webhook', async () => {
    const req = createRequest();
    const res = createResponse();

    await apiLineWebhook(req, res);

    expect(validateSignature).toHaveBeenCalledWith(JSON.stringify(req.body), 'channel-secret', 'signature');
    expect(ingestWebhook).toHaveBeenCalledWith(req.body);
    expect(lineWebhookOnRequest).toHaveBeenCalledWith(req, res);
    expect(validateSignature.mock.invocationCallOrder[0]).toBeLessThan(ingestWebhook.mock.invocationCallOrder[0]);
    expect(ingestWebhook.mock.invocationCallOrder[0]).toBeLessThan(initialize.mock.invocationCallOrder[0]);
    expect(initialize.mock.invocationCallOrder[0]).toBeLessThan(lineWebhookOnRequest.mock.invocationCallOrder[0]);
  });

  it('rejects invalid LINE signatures', async () => {
    validateSignature.mockReturnValue(false);

    await expect(apiLineWebhook(createRequest(), createResponse())).rejects.toThrow('Invalid LINE signature');

    expect(ingestWebhook).not.toHaveBeenCalled();
    expect(createDispatcher).not.toHaveBeenCalled();
    expect(lineWebhookOnRequest).not.toHaveBeenCalled();
  });

  it.each(['signature', 'rawBody'] as const)('rejects a missing %s before ingest or initialization', async (missing) => {
    const req = createRequest();
    if (missing === 'signature') delete req.headers['x-line-signature'];
    else delete req.rawBody;

    await expect(apiLineWebhook(req, createResponse())).rejects.toThrow('Invalid LINE signature');

    expect(validateSignature).not.toHaveBeenCalled();
    expect(ingestWebhook).not.toHaveBeenCalled();
    expect(createDispatcher).not.toHaveBeenCalled();
    expect(lineWebhookOnRequest).not.toHaveBeenCalled();
  });

  it('does not initialize or dispatch when member ingestion fails', async () => {
    const error = new Error('ingestion failed');
    ingestWebhook.mockRejectedValueOnce(error);

    await expect(apiLineWebhook(createRequest(), createResponse())).rejects.toBe(error);

    expect(validateSignature).toHaveBeenCalledTimes(1);
    expect(createDispatcher).not.toHaveBeenCalled();
    expect(lineWebhookOnRequest).not.toHaveBeenCalled();
  });

  it('makes concurrent requests await the same initialization and reuses the ready dispatcher', async () => {
    const pending = deferred();
    initialize.mockReturnValueOnce(pending.promise);
    const first = apiLineWebhook(createRequest(), createResponse());
    await nextTurn();
    const second = apiLineWebhook(createRequest(), createResponse());
    await nextTurn();
    const dispatchesBeforeReady = lineWebhookOnRequest.mock.calls.length;

    pending.resolve();
    await Promise.all([first, second]);

    expect(dispatchesBeforeReady).toBe(0);
    expect(createDispatcher).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(lineWebhookOnRequest).toHaveBeenCalledTimes(2);

    await apiLineWebhook(createRequest(), createResponse());
    expect(createDispatcher).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(lineWebhookOnRequest).toHaveBeenCalledTimes(3);
  });

  it('rejects all waiting requests on init failure, then initializes afresh and reuses that dispatcher', async () => {
    const pending = deferred();
    const error = new Error('initialization failed');
    initialize.mockReturnValueOnce(pending.promise);
    const first = apiLineWebhook(createRequest(), createResponse());
    await nextTurn();
    const second = apiLineWebhook(createRequest(), createResponse());
    const waiting = Promise.allSettled([first, second]);
    await nextTurn();
    pending.reject(error);

    expect(await waiting).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
    expect(lineWebhookOnRequest).not.toHaveBeenCalled();
    expect(createDispatcher).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);

    await apiLineWebhook(createRequest(), createResponse());
    await apiLineWebhook(createRequest(), createResponse());

    expect(createDispatcher).toHaveBeenCalledTimes(2);
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(lineWebhookOnRequest).toHaveBeenCalledTimes(2);
  });
});

// 讓目前 request 的 microtask chain 抵達可控的 init gate，不依賴固定毫秒數。
const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

const createRequest = (): Request => {
  const body = {
    destination: 'bot-id',
    events: [],
  };

  return {
    headers: {
      'x-line-signature': 'signature',
    },
    rawBody: Buffer.from(JSON.stringify(body)),
    path: '/lineWebhook',
    body,
  } as unknown as Request;
};

const createResponse = (): Response => ({
  status: jest.fn().mockReturnThis(),
  end: jest.fn(),
} as unknown as Response);
