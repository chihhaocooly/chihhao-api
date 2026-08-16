import { Request, Response } from 'express';
import { getProjectAssetReferences } from '../../functions/projectAsset/projectAssetService';

const apiGetProjectAssetReferences = async (req: Request, res: Response): Promise<void> => {
  const result = await getProjectAssetReferences(req.params.assetKey);
  if (result.missing) {
    res.status(404).json({ message: '素材不存在' });
    return;
  }

  res.json({ references: result.references, canDelete: result.canDelete });
};

export default apiGetProjectAssetReferences;
