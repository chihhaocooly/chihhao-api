import { Request, Response } from 'express';
import { updateProjectAsset } from '../../functions/projectAsset/projectAssetService';

const apiUpdateProjectAsset = async (req: Request, res: Response): Promise<void> => {
  const result = await updateProjectAsset(req.params.assetKey, req.body);
  if (!result.item) {
    res.status(404).json({ message: '素材不存在' });
    return;
  }

  res.json({ item: result.item });
};

export default apiUpdateProjectAsset;
