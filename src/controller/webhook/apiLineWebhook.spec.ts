import { Request, Response } from 'express';

const lineWebhookOnRequest = jest.fn(async (_req: Request, res: Response) => {
  res.status(200).end();
});
const ingestWebhook = jest.fn();
const getMessageApiChannelAccessToken = jest.fn();
const getMessageApiChannelSecret = jest.fn();
const validateSignature = jest.fn();

jest.mock('@chihhaocooly/chihhao-package', () => ({
  LineWebhook: jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    lineWebhookOnRequest,
  })),
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

import { apiLineWebhook } from './apiLineWebhook';

describe('apiLineWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  it('rejects invalid LINE signatures', async () => {
    validateSignature.mockReturnValue(false);

    await expect(apiLineWebhook(createRequest(), createResponse())).rejects.toThrow('Invalid LINE signature');

    expect(ingestWebhook).not.toHaveBeenCalled();
    expect(lineWebhookOnRequest).not.toHaveBeenCalled();
  });
});

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
