import { Request, Response } from 'express';
import { LineMemberPushService } from '../../functions/lineMembers/lineMemberPushService';

const apiPushMemberMessage = async (req: Request, res: Response): Promise<void> => {
  res.json(await new LineMemberPushService().pushMessage(req.params.id, req.body));
};

export default apiPushMemberMessage;
