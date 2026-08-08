import { Request, Response } from 'express';
import { uploadLineMessageImageAsset } from '../../functions/lineMessage/lineMessageImageAssetService';

const apiUploadLineMessageImageAsset = async (req: Request, res: Response): Promise<void> => {
  const result = await uploadLineMessageImageAsset({
    file: req.file as Express.Multer.File,
    createdByUserId: req.authContext?.userId ?? null,
  });

  if (!result.item) {
    res.status(400).json({ fieldErrors: result.fieldErrors });
    return;
  }

  res.status(201).json({ item: result.item });
};

export default apiUploadLineMessageImageAsset;
