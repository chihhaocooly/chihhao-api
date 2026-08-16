import { Request, Response } from 'express';
import {
  ListProjectAssetsOptions,
  ProjectAssetFileKind,
  ProjectAssetOwnerModule,
  ProjectAssetStatus,
  ProjectAssetUsageProfileKey,
  projectAssetFileKinds,
  projectAssetOwnerModules,
  projectAssetStatuses,
  projectAssetUsageProfileKeys,
} from '../../functions/projectAsset/projectAssetTypes';
import { listProjectAssets } from '../../functions/projectAsset/projectAssetService';

const apiListProjectAssets = async (req: Request, res: Response): Promise<void> => {
  const options: ListProjectAssetsOptions = {
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    ownerModule: normalizeQueryValue(req.query.ownerModule, projectAssetOwnerModules) as ProjectAssetOwnerModule | undefined,
    fileKind: normalizeQueryValue(req.query.fileKind, projectAssetFileKinds) as ProjectAssetFileKind | undefined,
    usageProfileKey: normalizeQueryValue(req.query.usageProfileKey, projectAssetUsageProfileKeys) as ProjectAssetUsageProfileKey | undefined,
    status: normalizeQueryValue(req.query.status, projectAssetStatuses) as ProjectAssetStatus | undefined,
    usedState: req.query.usedState === 'used' || req.query.usedState === 'unused' ? req.query.usedState : undefined,
    page: typeof req.query.page === 'string' ? Number(req.query.page) : undefined,
    pageSize: typeof req.query.pageSize === 'string' ? Number(req.query.pageSize) : undefined,
  };

  res.json(await listProjectAssets(options));
};

const normalizeQueryValue = <T extends readonly string[]>(value: unknown, allowedValues: T): T[number] | undefined => {
  return typeof value === 'string' && allowedValues.includes(value)
    ? value
    : undefined;
};

export default apiListProjectAssets;
