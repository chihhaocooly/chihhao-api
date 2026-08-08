import { Request, Response } from 'express';
import { deleteLineMessage } from '../../functions/lineMessage/lineMessageService';

const apiDeleteLineMessage = async (req: Request, res: Response): Promise<void> => {
  const result = await deleteLineMessage(req.params.lineMessageKey);

  if (result.missing) {
    res.status(404).json({ statusCode: 404, statusMsg: 'Line message not found' });
    return;
  }

  if (!result.deleted) {
    res.status(409).json({
      statusCode: 409,
      statusMsg: 'Line message is referenced',
      references: result.references,
    });
    return;
  }

  res.status(204).send();
};

export default apiDeleteLineMessage;
