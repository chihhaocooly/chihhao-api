import { Request, Response } from 'express';
import { isLineMessageType } from '../../functions/lineMessage/lineMessageValidator';
import { listLineMessages } from '../../functions/lineMessage/lineMessageService';

const apiListLineMessages = async (req: Request, res: Response): Promise<void> => {
  const rawType = typeof req.query.type === 'string' ? req.query.type : undefined;
  const type = rawType && isLineMessageType(rawType) ? rawType : undefined;
  const result = await listLineMessages({
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    type,
    page: Number(req.query.page),
    pageSize: Number(req.query.pageSize),
  });

  res.json(result);
};

export default apiListLineMessages;
