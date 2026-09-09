import { In } from 'typeorm';
import {
  AppDataSource,
  LineMember,
  MemberIdentity,
  MemberSubIdentity,
  MemberMenuSync,
  ListLineMembersRequest,
} from '@chihhaocooly/chihhao-package';
import { MyError } from '../../@types/my-error';
import { toLineMemberDto } from '../lineMembers/lineMemberMapper';
export const listMembersWithIdentity = async (
  options: ListLineMembersRequest & { subIdentityId?: string; identityId?: string }
) => {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw new MyError(400, '分頁格式不正確');
  const query = AppDataSource.manager.createQueryBuilder(LineMember, 'member');
  if (options.keyword?.trim())
    query.andWhere('(member.lineUserId LIKE :keyword OR member.displayName LIKE :keyword)', {
      keyword: `%${options.keyword.trim()}%`,
    });
  if (options.friendStatus && options.friendStatus !== 'all') {
    if (!['followed', 'blocked', 'unknown'].includes(options.friendStatus)) throw new MyError(400, '追蹤狀態不正確');
    query.andWhere('member.friendStatus = :status', { status: options.friendStatus });
  }
  if (options.identityId)
    query.andWhere('member.subIdentityId IN (SELECT id FROM member_sub_identity WHERE identityId = :identityId)', {
      identityId: options.identityId,
    });
  if (options.subIdentityId === 'none') query.andWhere('member.subIdentityId IS NULL');
  else if (options.subIdentityId)
    query.andWhere('member.subIdentityId = :subIdentityId', { subIdentityId: options.subIdentityId });
  const sort =
    options.sort && ['lastInteractionAt', 'createdAt', 'displayName'].includes(options.sort)
      ? options.sort
      : 'lastInteractionAt';
  const [members, total] = await query
    .orderBy(`member.${sort}`, options.direction === 'asc' ? 'ASC' : 'DESC')
    .addOrderBy('member.id', 'ASC')
    .skip((page - 1) * pageSize)
    .take(pageSize)
    .getManyAndCount();
  const syncs = members.length
    ? await AppDataSource.manager.findBy(MemberMenuSync, { memberId: In(members.map((member) => member.id)) })
    : [];
  const [subs, parents] = await Promise.all([
    AppDataSource.manager.find(MemberSubIdentity),
    AppDataSource.manager.find(MemberIdentity),
  ]);
  return {
    items: members.map((member) => {
      const sub = subs.find((item) => item.id === member.subIdentityId);
      const parent = parents.find((item) => item.id === sub?.identityId);
      return {
        ...toLineMemberDto(member),
        menuSyncStatus: syncs.find((sync) => sync.memberId === member.id)?.status ?? null,
        membership: {
          subIdentityId: member.subIdentityId,
          subIdentityName: sub?.name ?? null,
          identityName: parent?.name ?? null,
          version: member.membershipVersion,
        },
      };
    }),
    total,
    page,
    pageSize,
  };
};
