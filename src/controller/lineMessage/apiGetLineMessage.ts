import { Request, Response } from 'express';
import { getLineMessageByKey } from '../../functions/lineMessage/lineMessageService';

const apiGetLineMessage = async (req: Request, res: Response): Promise<void> => {
  const item = await getLineMessageByKey(req.params.lineMessageKey);

  if (!item) {
    res.status(404).json({ statusCode: 404, statusMsg: 'Line message not found' });
    return;
  }

  res.json({ item });
};

export default apiGetLineMessage;
