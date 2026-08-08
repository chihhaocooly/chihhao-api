import { Request, Response } from 'express';
import { copyLineMessage } from '../../functions/lineMessage/lineMessageService';

const apiCopyLineMessage = async (req: Request, res: Response): Promise<void> => {
  const item = await copyLineMessage(req.params.lineMessageKey);

  if (!item) {
    res.status(404).json({ statusCode: 404, statusMsg: 'Line message not found' });
    return;
  }

  res.status(201).json({ item });
};

export default apiCopyLineMessage;
