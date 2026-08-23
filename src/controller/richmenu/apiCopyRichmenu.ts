import { Request, Response } from 'express';
import { copyRichmenu } from '../../functions/richmenu/richmenuService';

const apiCopyRichmenu = async (req: Request, res: Response): Promise<void> => {
  const { result, item } = await copyRichmenu(req.params.richmenuKey);
  if (!item) {
    res.status(400).json(result);
    return;
  }

  res.status(201).json({ item });
};

export default apiCopyRichmenu;
