import { Request, Response } from 'express';
import { listLineMessageImageAssets } from '../../functions/lineMessage/lineMessageImageAssetService';

const apiListLineMessageImageAssets = async (req: Request, res: Response): Promise<void> => {
  const result = await listLineMessageImageAssets({
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    page: Number(req.query.page),
    pageSize: Number(req.query.pageSize),
  });

  res.json(result);
};

export default apiListLineMessageImageAssets;
