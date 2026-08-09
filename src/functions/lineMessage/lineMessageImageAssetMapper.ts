import { LineMessageImageAsset } from '@chihhaocooly/chihhao-package';
import {
  LineMessageImageAssetDto,
  LineMessageImageAssetKind,
  LineMessageImageVariantsDto,
} from './lineMessageTypes';

type LineMessageImageAssetEntity = LineMessageImageAsset & {
  assetKind?: LineMessageImageAssetKind | string | null;
  width?: number | string | null;
  height?: number | string | null;
  imagemapBaseUrl?: string | null;
  imagemapBaseSizeWidth?: number | string | null;
  imagemapBaseSizeHeight?: number | string | null;
  imageVariants?: LineMessageImageVariantsDto | string | null;
};

export const toLineMessageImageAssetDto = (asset: LineMessageImageAssetEntity): LineMessageImageAssetDto => ({
  imageAssetKey: asset.imageAssetKey,
  originalFileName: asset.originalFileName,
  contentType: asset.contentType,
  sizeBytes: asset.sizeBytes,
  assetKind: normalizeAssetKind(asset.assetKind),
  storageBucket: asset.storageBucket,
  storageObjectName: asset.storageObjectName,
  publicUrl: asset.publicUrl,
  width: toNullableNumber(asset.width),
  height: toNullableNumber(asset.height),
  imagemapBaseUrl: asset.imagemapBaseUrl ?? null,
  imagemapBaseSizeWidth: toNullableNumber(asset.imagemapBaseSizeWidth),
  imagemapBaseSizeHeight: toNullableNumber(asset.imagemapBaseSizeHeight),
  imageVariants: normalizeVariants(asset.imageVariants),
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

const normalizeAssetKind = (value: unknown): LineMessageImageAssetKind => {
  return value === 'imagemap' ? 'imagemap' : 'messageImage';
};

const toNullableNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeVariants = (value: LineMessageImageVariantsDto | string | null | undefined): LineMessageImageVariantsDto | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isVariantMap(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isVariantMap(value) ? value : null;
};

const isVariantMap = (value: unknown): value is LineMessageImageVariantsDto => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};
