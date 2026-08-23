import { Request, Response } from 'express';
import { syncRichmenusFromLine } from '../../functions/richmenu/richmenuService';

const apiSyncRichmenus = async (req: Request, res: Response): Promise<void> => {
  const result = await syncRichmenusFromLine(req.authContext?.userId ?? null);
  res.json(result);
};

export default apiSyncRichmenus;
