import { Request, Response } from 'express';
import { MyError } from '../../@types/my-error';
import { getRichmenuByKey } from '../../functions/richmenu/richmenuService';

const apiGetRichmenu = async (req: Request, res: Response): Promise<void> => {
  const item = await getRichmenuByKey(req.params.richmenuKey);
  if (!item) {
    throw new MyError(404, '找不到圖文選單');
  }

  res.json({ item });
};

export default apiGetRichmenu;
