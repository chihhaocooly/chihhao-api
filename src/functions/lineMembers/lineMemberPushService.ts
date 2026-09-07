import { LineMemberRepository } from '@chihhaocooly/chihhao-package';
import { Client, Message } from '@line/bot-sdk';
import { validate as isUuid } from 'uuid';
import { MyError } from '../../@types/my-error';
import { validateSavedLineMessage } from '../lineMessage/validateSavedLineMessage';
import { SiteLineSettingsService } from '../siteSettings';

export interface PushMemberMessageRequest {
  lineMessageKey: string;
  retryKey: string;
}

export interface PushMemberMessageResponse {
  status: 'accepted';
}

type PushClient = Pick<Client, 'setRequestOptionOnce' | 'pushMessage'>;

const createPushClient = async (): Promise<PushClient> => {
  try {
    const channelAccessToken = await new SiteLineSettingsService().getMessageApiChannelAccessToken();
    if (!channelAccessToken) throw new Error('Missing token');
    // request option 為一次性狀態，不能在並發推播間共用 client。
    return new Client({ channelAccessToken });
  } catch {
    throw new MyError(503, 'LINE 推播設定暫時無法使用，請檢查站台設定');
  }
};

export class LineMemberPushService {
  constructor(
    private readonly repository: Pick<LineMemberRepository, 'findById'> = new LineMemberRepository(),
    private readonly validateMessage = validateSavedLineMessage,
    private readonly createClient: () => Promise<PushClient> = createPushClient,
  ) {}

  async pushMessage(id: string, body: unknown): Promise<PushMemberMessageResponse> {
    if (!isUuid(id) || !isRecord(body)
      || typeof body.lineMessageKey !== 'string' || !isUuid(body.lineMessageKey)
      || typeof body.retryKey !== 'string' || !isUuid(body.retryKey)) {
      throw new MyError(400, '會員、訊息識別碼或重試識別碼格式不正確');
    }

    const member = await this.repository.findById(id);
    if (!member) throw new MyError(404, '找不到會員');
    if (member.friendStatus !== 'followed') {
      throw new MyError(409, '僅可對可觸達會員推播，請重新整理會員列表');
    }

    const validation = await this.validateMessage(body.lineMessageKey);
    if (!validation.isValid || !validation.isSendable || !validation.normalized) {
      throw new MyError(422, '訊息內容或引用素材無效，請至訊息管理修正後重新選擇');
    }

    const client = await this.createClient();
    try {
      client.setRequestOptionOnce({ retryKey: body.retryKey });
      // validator 已檢查儲存內容；SDK 的 Message union 僅在此邊界收斂。
      await client.pushMessage(member.lineUserId, validation.normalized.customPayload as unknown as Message);
    } catch (error) {
      const status = isRecord(error) ? error.statusCode : undefined;
      if (status === 409 && hasAcceptedRequestId(error)) return { status: 'accepted' };
      if (status === 429) throw new MyError(429, 'LINE 發送額度不足或請求過於頻繁，請稍後重試');
      throw new MyError(502, 'LINE 推播未能確認受理，請保留此視窗重試；關閉後重新發送可能重複');
    }
    return { status: 'accepted' };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasAcceptedRequestId = (error: unknown): boolean => {
  if (!isRecord(error) || !isRecord(error.originalError)) return false;
  const response = error.originalError.response;
  if (!isRecord(response) || !isRecord(response.headers)) return false;
  const requestId = response.headers['x-line-accepted-request-id'];
  return typeof requestId === 'string' && requestId.length > 0;
};
