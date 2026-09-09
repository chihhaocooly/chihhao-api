import { MemberMenuSyncRepository } from '@chihhaocooly/chihhao-package';
import { MemberProfileService } from '../membership/memberProfileService';
import {
  GetLineMemberResponse,
  LineMemberFriendStatus,
  LineMemberRepository,
  lineMemberFriendStatuses,
  ListLineMembersRequest,
  ListLineMembersResponse,
} from '@chihhaocooly/chihhao-package';
import { Profile, WebhookEvent, WebhookRequestBody } from '@line/bot-sdk';
import { MyError } from '../../@types/my-error';
import { toLineMemberDto } from './lineMemberMapper';

export interface LineProfileClient {
  getProfile(userId: string): Promise<Profile>;
}

interface LineWebhookEventExtension {
  webhookEventId?: string;
  deliveryContext?: {
    isRedelivery?: boolean;
  };
}

const DEFAULT_PAGE_SIZE = 20;

export class LineMemberService {
  constructor(
    private readonly repository = new LineMemberRepository(),
    private readonly profileClient?: LineProfileClient,
  ) {}

  async listMembers(options: ListLineMembersRequest): Promise<ListLineMembersResponse> {
    const result = await this.repository.findList({
      keyword: options.keyword,
      friendStatus: this.normalizeFriendStatus(options.friendStatus),
      page: this.normalizePositiveNumber(options.page, 1),
      pageSize: this.normalizePageSize(options.pageSize),
      sort: options.sort,
      direction: options.direction,
    });

    return {
      items: result.items.map(toLineMemberDto),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  async getMember(id: string): Promise<GetLineMemberResponse> {
    const member = await this.repository.findById(id);
    if (!member) {
      throw new MyError(404, 'LINE member not found');
    }

    return {
      item: toLineMemberDto(member),
    };
  }

  async ingestWebhook(body: WebhookRequestBody): Promise<void> {
    await Promise.all(body.events.map((event) => this.ingestEvent(body.destination, event)));
  }

  private async ingestEvent(destination: string, event: WebhookEvent): Promise<void> {
    const eventId = this.getWebhookEventId(event);
    if (await this.repository.hasWebhookEvent(eventId)) {
      return;
    }

    const occurredAt = new Date(event.timestamp);
    const sourceUserId = this.getSourceUserId(event);
    const messageType = this.getMessageType(event);

    try {
      if (sourceUserId) {
        await this.applyMemberUpdate(event, sourceUserId, occurredAt, messageType);
      }

      await this.repository.createWebhookEvent({
        webhookEventId: eventId,
        destination,
        eventType: event.type,
        sourceType: event.source?.type ?? null,
        sourceUserId,
        messageType,
        occurredAt,
        isRedelivery: this.isRedelivery(event),
        status: sourceUserId ? 'processed' : 'skipped',
        processedAt: new Date(),
      });
    } catch (error) {
      await this.repository.createWebhookEvent({
        webhookEventId: eventId,
        destination,
        eventType: event.type,
        sourceType: event.source?.type ?? null,
        sourceUserId,
        messageType,
        occurredAt,
        isRedelivery: this.isRedelivery(event),
        status: 'failed',
        errorMessage: this.getErrorMessage(error),
        processedAt: new Date(),
      });

      throw error;
    }
  }

  private async applyMemberUpdate(
    event: WebhookEvent,
    lineUserId: string,
    occurredAt: Date,
    messageType: string | null,
  ): Promise<void> {
    if (event.type === 'follow') {
      await this.repository.markFollowed(lineUserId, occurredAt);
      await this.syncProfile(lineUserId);
      const member = await this.repository.findByLineUserId(lineUserId);
      if (member && (member.subIdentityId || await new MemberMenuSyncRepository().find(member.id))) await new MemberProfileService().retry(member.id);
      return;
    }

    if (event.type === 'unfollow') {
      await this.repository.markBlocked(lineUserId, occurredAt);
      return;
    }

    await this.repository.recordInteraction({
      lineUserId,
      occurredAt,
      eventType: event.type,
      messageType,
    });

    if (event.type === 'message' || event.type === 'postback') {
      await this.syncProfile(lineUserId);
    }
  }

  private async syncProfile(lineUserId: string): Promise<void> {
    if (!this.profileClient) {
      return;
    }

    try {
      const profile = await this.profileClient.getProfile(lineUserId);
      await this.repository.updateProfile(lineUserId, {
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
        statusMessage: profile.statusMessage,
        language: profile.language,
      });
    } catch (error) {
      console.error('LINE profile sync failed', {
        lineUserId,
        message: this.getErrorMessage(error),
      });
      await this.repository.markProfileSyncFailed(lineUserId);
    }
  }

  private normalizeFriendStatus(status: ListLineMembersRequest['friendStatus']): LineMemberFriendStatus | 'all' | undefined {
    if (!status || status === 'all') {
      return status;
    }

    return lineMemberFriendStatuses.includes(status) ? status : undefined;
  }

  private normalizePositiveNumber(value: number | undefined, fallback: number): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
  }

  private normalizePageSize(value: number | undefined): number {
    return Math.min(this.normalizePositiveNumber(value, DEFAULT_PAGE_SIZE), 100);
  }

  private getWebhookEventId(event: WebhookEvent): string {
    const extendedEvent = event as WebhookEvent & LineWebhookEventExtension;
    return extendedEvent.webhookEventId ?? `legacy-${event.type}-${event.timestamp}-${this.getSourceUserId(event) ?? 'unknown'}`;
  }

  private isRedelivery(event: WebhookEvent): boolean {
    const extendedEvent = event as WebhookEvent & LineWebhookEventExtension;
    return extendedEvent.deliveryContext?.isRedelivery === true;
  }

  private getSourceUserId(event: WebhookEvent): string | null {
    return 'userId' in event.source ? event.source.userId ?? null : null;
  }

  private getMessageType(event: WebhookEvent): string | null {
    return event.type === 'message' ? event.message.type : null;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
