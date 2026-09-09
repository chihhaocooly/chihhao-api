import { Request, Response } from 'express';
import { ListLineMembersRequest } from '@chihhaocooly/chihhao-package';
import { listMembersWithIdentity } from '../../functions/membership/memberListService';

const apiListLineMembers = async (req: Request, res: Response): Promise<void> => {
  const query: ListLineMembersRequest = {
    keyword: typeof req.query.keyword === 'string' ? req.query.keyword : undefined,
    friendStatus: typeof req.query.friendStatus === 'string'
      ? req.query.friendStatus as ListLineMembersRequest['friendStatus']
      : undefined,
    page: typeof req.query.page === 'string' ? Number(req.query.page) : undefined,
    pageSize: typeof req.query.pageSize === 'string' ? Number(req.query.pageSize) : undefined,
    sort: typeof req.query.sort === 'string' ? req.query.sort as ListLineMembersRequest['sort'] : undefined,
    direction: typeof req.query.direction === 'string' ? req.query.direction as ListLineMembersRequest['direction'] : undefined,
  };

  res.json(await listMembersWithIdentity({ ...query, identityId: typeof req.query.identityId === 'string' ? req.query.identityId : undefined, subIdentityId: typeof req.query.subIdentityId === 'string' ? req.query.subIdentityId : undefined }));
};

export default apiListLineMembers;
