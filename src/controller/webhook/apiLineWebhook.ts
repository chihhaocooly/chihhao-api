import { LineWebhook } from '@chihhaocooly/chihhao-package';
import { Client, validateSignature, WebhookRequestBody } from '@line/bot-sdk';
import { Request, Response } from 'express';
import { MyError } from '../../@types/my-error';
import { LineMemberService } from '../../functions/lineMembers';
import { SiteLineSettingsService } from '../../functions/siteSettings';

let readyWebhook: Promise<LineWebhook> | null = null;

function getInstance(): Promise<LineWebhook> {
  if (!readyWebhook) {
    // 只公開初始化成功的結果，讓所有併發請求共用相同的等待與失敗。
    readyWebhook = (async () => {
      const lineWebhook = new LineWebhook({ getLineClient: createLineClient });
      await lineWebhook.init();
      return lineWebhook;
    })().catch((error: unknown) => {
      // 初始化失敗不可留下未就緒的 instance，下一個有效請求仍可重試。
      readyWebhook = null;
      throw error;
    });
  }
  return readyWebhook;
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
