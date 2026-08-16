import { Request, Response } from 'express';
import { deleteProjectAsset } from '../../functions/projectAsset/projectAssetService';

const apiDeleteProjectAsset = async (req: Request, res: Response): Promise<void> => {
  const result = await deleteProjectAsset(req.params.assetKey);
  if (result.missing) {
    res.status(404).json({ message: '素材不存在' });
    return;
  }

  if (!result.deleted) {
    res.status(409).json({ message: '素材仍被使用，無法刪除', references: result.references });
    return;
  }

  res.status(204).send();
};

export default apiDeleteProjectAsset;
