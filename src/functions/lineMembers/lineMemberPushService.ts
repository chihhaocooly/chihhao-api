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
      // 素材的 type 與內容分欄儲存；自訂 JSON 才由 payload 自帶 LINE type。
      const { type, customPayload } = validation.normalized;
      const message = type === 'json' ? customPayload : { ...customPayload, type };
      await client.pushMessage(member.lineUserId, message as unknown as Message);
    } catch (error) {
      const status = isRecord(error) ? error.statusCode : undefined;
      if (status === 409 && hasAcceptedRequestId(error)) return { status: 'accepted' };
      console.error('LINE member push failed', {
        statusCode: typeof status === 'number' ? status : null,
        requestId: getRequestId(error),
      });
      if (status === 400) throw new MyError(422, 'LINE 拒絕訊息格式，請至訊息管理檢查內容');
      if (status === 401 || status === 403) throw new MyError(503, 'LINE 推播授權失敗，請檢查站台設定');
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

// 僅記錄 LINE request ID，不記錄 SDK error（可能含 token、訊息及會員資料）。
const getRequestId = (error: unknown): string | null => {
  if (!isRecord(error) || !isRecord(error.originalError)) return null;
  const response = error.originalError.response;
  if (!isRecord(response) || !isRecord(response.headers)) return null;
  const value = response.headers['x-line-request-id'];
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(value) ? value : null;
};
