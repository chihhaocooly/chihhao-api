import { Request, Response } from 'express';
import { readReplySettings } from '../../functions/lineMessage/lineMessageService';

const apiGetReplySettings = async (req: Request, res: Response): Promise<void> => {
  res.json({ settings: await readReplySettings() });
};

export default apiGetReplySettings;
