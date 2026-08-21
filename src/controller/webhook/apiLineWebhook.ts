import { LineWebhook } from '@chihhaocooly/chihhao-package';
import { Client, validateSignature, WebhookRequestBody } from '@line/bot-sdk';
import { Request, Response } from 'express';
import { MyError } from '../../@types/my-error';
import { LineMemberService } from '../../functions/lineMembers';
import { SiteLineSettingsService } from '../../functions/siteSettings';

let _lineWebhook: LineWebhook | null = null;
let _initPromise: Promise<void> | null = null;

/**
 * 獲取唯一實例，保證多個請求同時進入時不會重複執行 init()
 */
async function getInstance(): Promise<LineWebhook> {
  if (!_lineWebhook) {
    if (!_initPromise) {
      // 如果沒有初始化，就建立初始化 Promise
      _initPromise = (async () => {
        _lineWebhook = new LineWebhook({
          getLineClient: createLineClient,
        });
        await _lineWebhook.init();
      })();
    }
    // 等待初始化完成
    await _initPromise;
  }
  return _lineWebhook!;
}

async function createLineClient(): Promise<Client> {
  const siteLineSettingsService = new SiteLineSettingsService();
  const [channelAccessToken, channelSecret] = await Promise.all([
    siteLineSettingsService.getMessageApiChannelAccessToken(),
    siteLineSettingsService.getMessageApiChannelSecret(),
  ]);

  return new Client({
    channelAccessToken,
    channelSecret,
  });
}

async function verifyLineSignature(req: Request): Promise<void> {
  const signature = Array.isArray(req.headers['x-line-signature'])
    ? req.headers['x-line-signature'][0]
    : req.headers['x-line-signature'];

  if (!signature || !req.rawBody) {
    throw new MyError(401, 'Invalid LINE signature');
  }

  const channelSecret = await new SiteLineSettingsService().getMessageApiChannelSecret();
  if (!validateSignature(req.rawBody.toString('utf8'), channelSecret, signature)) {
    throw new MyError(401, 'Invalid LINE signature');
  }
}

/**
 * Line webhook 處理函式
 * @param req
 * @param res
 */
export const apiLineWebhook = async (req: Request, res: Response) => {
  await verifyLineSignature(req);
  console.log('🚀 path =>', req.path, ' events =>', JSON.stringify((req.body as WebhookRequestBody).events?.map((event) => event.type) ?? []));
  const lineClient = await createLineClient();
  await new LineMemberService(undefined, lineClient).ingestWebhook(req.body as WebhookRequestBody);
  const lineWebhook = await getInstance();
  return lineWebhook.lineWebhookOnRequest(req, res);
};
