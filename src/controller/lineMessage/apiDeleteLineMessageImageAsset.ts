import { Request, Response } from 'express';
import { deleteLineMessageImageAsset } from '../../functions/lineMessage/lineMessageImageAssetService';

const apiDeleteLineMessageImageAsset = async (req: Request, res: Response): Promise<void> => {
  const result = await deleteLineMessageImageAsset(req.params.imageAssetKey);

  if (result.missing) {
    res.status(404).json({ statusCode: 404, statusMsg: 'Image asset not found' });
    return;
  }

  if (!result.deleted) {
    res.status(409).json({
      statusCode: 409,
      statusMsg: 'Image asset is referenced',
      references: result.references,
    });
    return;
  }

  res.status(204).send();
};

export default apiDeleteLineMessageImageAsset;
