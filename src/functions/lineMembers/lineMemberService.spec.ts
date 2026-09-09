import { LineMemberRepository } from '@chihhaocooly/chihhao-package';
import { WebhookRequestBody } from '@line/bot-sdk';
import { LineMemberService, LineProfileClient } from './lineMemberService';

describe('LineMemberService', () => {
  const repository = {
    findList: jest.fn(),
    findById: jest.fn(),
    findByLineUserId: jest.fn().mockResolvedValue(null),
    hasWebhookEvent: jest.fn(),
    createWebhookEvent: jest.fn(),
    markFollowed: jest.fn(),
    markBlocked: jest.fn(),
    recordInteraction: jest.fn(),
    updateProfile: jest.fn(),
    markProfileSyncFailed: jest.fn(),
  } as unknown as jest.Mocked<LineMemberRepository>;
  const profileClient: jest.Mocked<LineProfileClient> = {
    getProfile: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.hasWebhookEvent.mockResolvedValue(false);
    repository.createWebhookEvent.mockResolvedValue({} as never);
    repository.markFollowed.mockResolvedValue({} as never);
    repository.markBlocked.mockResolvedValue({} as never);
    repository.recordInteraction.mockResolvedValue({} as never);
    repository.updateProfile.mockResolvedValue({} as never);
    repository.markProfileSyncFailed.mockResolvedValue({} as never);
    profileClient.getProfile.mockResolvedValue({
      userId: 'line-user-id',
      displayName: '王小明',
      pictureUrl: 'https://example.com/picture.jpg',
      statusMessage: 'hello',
      language: 'zh-TW',
    });
  });

  it('creates or updates a followed member and syncs profile', async () => {
    await new LineMemberService(repository, profileClient).ingestWebhook(createBody('follow'));

    expect(repository.markFollowed).toHaveBeenCalledWith('line-user-id', new Date(1000));
    expect(profileClient.getProfile).toHaveBeenCalledWith('line-user-id');
    expect(repository.updateProfile).toHaveBeenCalledWith('line-user-id', {
      displayName: '王小明',
      pictureUrl: 'https://example.com/picture.jpg',
      statusMessage: 'hello',
      language: 'zh-TW',
    });
    expect(repository.createWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      webhookEventId: 'event-id',
      eventType: 'follow',
      sourceUserId: 'line-user-id',
      status: 'processed',
    }));
  });

  it('marks unfollowed members as blocked without profile sync', async () => {
    await new LineMemberService(repository, profileClient).ingestWebhook(createBody('unfollow'));

    expect(repository.markBlocked).toHaveBeenCalledWith('line-user-id', new Date(1000));
    expect(profileClient.getProfile).not.toHaveBeenCalled();
  });

  it('deduplicates redelivered webhook events', async () => {
    repository.hasWebhookEvent.mockResolvedValue(true);

    await new LineMemberService(repository, profileClient).ingestWebhook(createBody('message'));

    expect(repository.recordInteraction).not.toHaveBeenCalled();
    expect(repository.createWebhookEvent).not.toHaveBeenCalled();
  });

  it('does not fail webhook ingestion when profile sync fails', async () => {
    profileClient.getProfile.mockRejectedValue(new Error('LINE failed'));

    await new LineMemberService(repository, profileClient).ingestWebhook(createBody('message'));

    expect(repository.recordInteraction).toHaveBeenCalledWith({
      lineUserId: 'line-user-id',
      occurredAt: new Date(1000),
      eventType: 'message',
      messageType: 'text',
    });
    expect(repository.markProfileSyncFailed).toHaveBeenCalledWith('line-user-id');
    expect(repository.createWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      status: 'processed',
    }));
  });
});

const createBody = (eventType: 'follow' | 'unfollow' | 'message'): WebhookRequestBody => ({
  destination: 'bot-id',
  events: [
    {
      type: eventType,
      mode: 'active',
      timestamp: 1000,
      source: {
        type: 'user',
        userId: 'line-user-id',
      },
      webhookEventId: 'event-id',
      deliveryContext: {
        isRedelivery: false,
      },
      ...(eventType === 'message'
        ? {
            replyToken: 'reply-token',
            message: {
              id: 'message-id',
              type: 'text',
              text: '不應被保存',
            },
          }
        : {}),
    },
  ],
} as unknown as WebhookRequestBody);
