import { Request, Response } from 'express';
import { createLineMessage } from '../../functions/lineMessage/lineMessageService';
import { SaveLineMessageRequest } from '../../functions/lineMessage/lineMessageTypes';

const apiCreateLineMessage = async (req: Request, res: Response): Promise<void> => {
  const { result, item } = await createLineMessage(req.body as SaveLineMessageRequest);

  if (!item) {
    res.status(400).json(result);
    return;
  }

  res.status(201).json({ item });
};

export default apiCreateLineMessage;
