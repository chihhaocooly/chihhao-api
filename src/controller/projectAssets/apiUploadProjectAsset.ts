import { Request, Response } from 'express';
import { uploadProjectAsset } from '../../functions/projectAsset/projectAssetService';

const apiUploadProjectAsset = async (req: Request, res: Response): Promise<void> => {
  const result = await uploadProjectAsset({
    file: req.file,
    usageProfileKey: req.body?.usageProfileKey,
    displayName: req.body?.displayName,
    tags: req.body?.tags,
    createdByUserId: req.authContext?.userId ?? null,
  });

  if (!result.item) {
    res.status(400).json({ fieldErrors: result.fieldErrors });
    return;
  }

  res.status(201).json({ item: result.item });
};

export default apiUploadProjectAsset;
