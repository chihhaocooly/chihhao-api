import { Request, Response } from 'express';
import { listProjectAssetUsageProfiles } from '../../functions/projectAsset/projectAssetService';

const apiListProjectAssetUsageProfiles = async (_req: Request, res: Response): Promise<void> => {
  res.json(listProjectAssetUsageProfiles());
};

export default apiListProjectAssetUsageProfiles;
