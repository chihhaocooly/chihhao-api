import { Request, Response } from 'express';
import { createRichmenu } from '../../functions/richmenu/richmenuService';
import { SaveRichmenuRequest } from '../../functions/richmenu/richmenuTypes';

const apiCreateRichmenu = async (req: Request, res: Response): Promise<void> => {
  const { result, item } = await createRichmenu(req.body as SaveRichmenuRequest);
  if (!item) {
    res.status(400).json(result);
    return;
  }

  res.status(201).json({ item });
};

export default apiCreateRichmenu;
