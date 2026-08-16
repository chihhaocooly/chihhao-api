import express from 'express';
import multer from 'multer';
import { requireRole } from '../../middlewares/requireRole';
import apiDeleteProjectAsset from './apiDeleteProjectAsset';
import apiGetProjectAsset from './apiGetProjectAsset';
import apiGetProjectAssetReferences from './apiGetProjectAssetReferences';
import apiListProjectAssets from './apiListProjectAssets';
import apiListProjectAssetUsageProfiles from './apiListProjectAssetUsageProfiles';
import apiUpdateProjectAsset from './apiUpdateProjectAsset';
import apiUploadProjectAsset from './apiUploadProjectAsset';

const maxAssetUploadBytes = 10 * 1024 * 1024;
const projectAssetsRouter = express.Router();
const uploadProjectAssetFile = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxAssetUploadBytes,
    files: 1,
  },
});

projectAssetsRouter.get(
  '/usage-profiles',
  requireRole(['admin', 'manager', 'viewer']),
  apiListProjectAssetUsageProfiles
);

projectAssetsRouter.get(
  '/',
  requireRole(['admin', 'manager', 'viewer']),
  apiListProjectAssets
);

projectAssetsRouter.post(
  '/',
  requireRole(['admin', 'manager']),
  uploadProjectAssetFile.single('asset'),
  apiUploadProjectAsset
);

projectAssetsRouter.get(
  '/:assetKey/references',
  requireRole(['admin', 'manager', 'viewer']),
  apiGetProjectAssetReferences
);

projectAssetsRouter.get(
  '/:assetKey',
  requireRole(['admin', 'manager', 'viewer']),
  apiGetProjectAsset
);

projectAssetsRouter.put(
  '/:assetKey',
  requireRole(['admin', 'manager']),
  apiUpdateProjectAsset
);

projectAssetsRouter.delete(
  '/:assetKey',
  requireRole(['admin', 'manager']),
  apiDeleteProjectAsset
);

export default projectAssetsRouter;
