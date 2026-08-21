import { LineMember, LineMemberDto } from '@chihhaocooly/chihhao-package';

const toIsoString = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  return typeof value === 'string' ? value : value.toISOString();
};

export const toLineMemberDto = (member: LineMember): LineMemberDto => ({
  id: member.id,
  lineUserId: member.lineUserId,
  displayName: member.displayName ?? null,
  pictureUrl: member.pictureUrl ?? null,
  statusMessage: member.statusMessage ?? null,
  language: member.language ?? null,
  friendStatus: member.friendStatus,
  firstFollowedAt: toIsoString(member.firstFollowedAt),
  lastFollowedAt: toIsoString(member.lastFollowedAt),
  blockedAt: toIsoString(member.blockedAt),
  lastInteractionAt: toIsoString(member.lastInteractionAt),
  lastInteractionType: member.lastInteractionType ?? null,
  lastMessageType: member.lastMessageType ?? null,
  interactionCount: member.interactionCount ?? 0,
  profileSyncedAt: toIsoString(member.profileSyncedAt),
  profileSyncFailedAt: toIsoString(member.profileSyncFailedAt),
  createdAt: toIsoString(member.createdAt),
  updatedAt: toIsoString(member.updatedAt),
});
