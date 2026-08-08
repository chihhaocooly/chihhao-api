import { Request, Response } from 'express';
import { updateLineMessage } from '../../functions/lineMessage/lineMessageService';
import { SaveLineMessageRequest } from '../../functions/lineMessage/lineMessageTypes';

const apiUpdateLineMessage = async (req: Request, res: Response): Promise<void> => {
  const { result, item } = await updateLineMessage(req.params.lineMessageKey, req.body as SaveLineMessageRequest);

  if (!result && !item) {
    res.status(404).json({ statusCode: 404, statusMsg: 'Line message not found' });
    return;
  }

  if (!item) {
    res.status(400).json(result);
    return;
  }

  res.json({ item });
};

export default apiUpdateLineMessage;
