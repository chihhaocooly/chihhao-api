import { Request, Response } from 'express';
import { getLineMessageImageAssetReferences } from '../../functions/lineMessage/lineMessageImageAssetService';

const apiGetLineMessageImageAssetReferences = async (req: Request, res: Response): Promise<void> => {
  const result = await getLineMessageImageAssetReferences(req.params.imageAssetKey);

  if (result.missing) {
    res.status(404).json({ statusCode: 404, statusMsg: 'Image asset not found' });
    return;
  }

  res.json({
    references: result.references,
    canDelete: result.canDelete,
  });
};

export default apiGetLineMessageImageAssetReferences;
