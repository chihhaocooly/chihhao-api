import { Request, Response } from 'express';
import { listLineMessageImageAssets } from '../../functions/lineMessage/lineMessageImageAssetService';
import { LINE_MESSAGE_IMAGE_ASSET_KINDS, LineMessageImageAssetKind } from '../../functions/lineMessage/lineMessageTypes';

const apiListLineMessageImageAssets = async (req: Request, res: Response): Promise<void> => {
  const rawAssetKind = typeof req.query.assetKind === 'string' ? req.query.assetKind : undefined;
  const assetKind = rawAssetKind && LINE_MESSAGE_IMAGE_ASSET_KINDS.includes(rawAssetKind as LineMessageImageAssetKind)
    ? rawAssetKind as LineMessageImageAssetKind
    : undefined;
  const result = await listLineMessageImageAssets({
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    assetKind,
    page: Number(req.query.page),
    pageSize: Number(req.query.pageSize),
  });

  res.json(result);
};

export default apiListLineMessageImageAssets;
