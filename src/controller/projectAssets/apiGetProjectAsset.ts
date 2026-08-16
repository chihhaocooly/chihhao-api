import { Request, Response } from 'express';
import { getProjectAsset } from '../../functions/projectAsset/projectAssetService';

const apiGetProjectAsset = async (req: Request, res: Response): Promise<void> => {
  const result = await getProjectAsset(req.params.assetKey);
  if (!result.item) {
    res.status(404).json({ message: '素材不存在' });
    return;
  }

  res.json({ item: result.item });
};

export default apiGetProjectAsset;
