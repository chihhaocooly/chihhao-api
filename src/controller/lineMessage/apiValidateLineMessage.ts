import { Request, Response } from 'express';
import { validateLineMessage } from '../../functions/lineMessage/lineMessageService';
import { SaveLineMessageRequest } from '../../functions/lineMessage/lineMessageTypes';

const apiValidateLineMessage = async (req: Request, res: Response): Promise<void> => {
  const result = await validateLineMessage(req.body as SaveLineMessageRequest);
  res.status(result.isValid ? 200 : 400).json(result);
};

export default apiValidateLineMessage;
