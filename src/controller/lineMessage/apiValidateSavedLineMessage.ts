import { Request, Response } from 'express';
import { validateSavedLineMessage } from '../../functions/lineMessage/validateSavedLineMessage';

const apiValidateSavedLineMessage = async (req: Request, res: Response): Promise<void> => {
  const { isValid, isSendable, summary, fieldErrors } = await validateSavedLineMessage(req.params.lineMessageKey);
  res.json({ isValid, isSendable, summary, fieldErrors });
};

export default apiValidateSavedLineMessage;
