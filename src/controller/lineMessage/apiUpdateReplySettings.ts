import { Request, Response } from 'express';
import { updateReplySettings } from '../../functions/lineMessage/lineMessageService';
import { ReplySettingsDto } from '../../functions/lineMessage/lineMessageTypes';

const apiUpdateReplySettings = async (req: Request, res: Response): Promise<void> => {
  const result = await updateReplySettings(req.body as Partial<ReplySettingsDto>);

  if (!result.settings) {
    res.status(400).json({ statusCode: 400, statusMsg: 'Invalid reply settings', fieldErrors: result.fieldErrors });
    return;
  }

  res.json({ settings: result.settings });
};

export default apiUpdateReplySettings;
