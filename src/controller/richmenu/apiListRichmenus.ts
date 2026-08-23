import { Request, Response } from 'express';
import { listRichmenus } from '../../functions/richmenu/richmenuService';
import { RichmenuStatus } from '../../functions/richmenu/richmenuTypes';

const apiListRichmenus = async (req: Request, res: Response): Promise<void> => {
  const status = req.query.status === 'draft' || req.query.status === 'published'
    ? req.query.status as RichmenuStatus
    : undefined;
  res.json(await listRichmenus(status));
};

export default apiListRichmenus;
