import { LineMessageImageAsset, LineMessageImageAssetDto } from '@chihhaocooly/chihhao-package';

export const toLineMessageImageAssetDto = (asset: LineMessageImageAsset): LineMessageImageAssetDto => ({
  imageAssetKey: asset.imageAssetKey,
  originalFileName: asset.originalFileName,
  contentType: asset.contentType,
  sizeBytes: asset.sizeBytes,
  storageBucket: asset.storageBucket,
  storageObjectName: asset.storageObjectName,
  publicUrl: asset.publicUrl,
  createdByUserId: asset.createdByUserId,
  createdAt: toIsoString(asset.createdAt),
  updatedAt: toIsoString(asset.updatedAt),
  deletedAt: toIsoString(asset.deletedAt),
});

const toIsoString = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
};
