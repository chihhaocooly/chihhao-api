import { Request, Response } from 'express';
import { updateRichmenu } from '../../functions/richmenu/richmenuService';
import { SaveRichmenuRequest } from '../../functions/richmenu/richmenuTypes';

const apiUpdateRichmenu = async (req: Request, res: Response): Promise<void> => {
  const { result, item } = await updateRichmenu(req.params.richmenuKey, req.body as SaveRichmenuRequest);
  if (!item) {
    res.status(400).json(result);
    return;
  }

  res.json({ item });
};

export default apiUpdateRichmenu;
