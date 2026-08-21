import { Request, Response } from 'express';
import { LineMemberService } from '../../functions/lineMembers';

const apiGetLineMember = async (req: Request, res: Response): Promise<void> => {
  res.json(await new LineMemberService().getMember(req.params.id));
};

export default apiGetLineMember;
