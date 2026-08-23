import { Request, Response } from 'express';
import { deleteRichmenu } from '../../functions/richmenu/richmenuService';

const apiDeleteRichmenu = async (req: Request, res: Response): Promise<void> => {
  await deleteRichmenu(req.params.richmenuKey);
  res.status(204).send();
};

export default apiDeleteRichmenu;
