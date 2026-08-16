import {
  ProjectAssetDto,
  ProjectAssetFileKind,
  ProjectAssetOwnerModule,
  ProjectAssetReferenceDto,
  ProjectAssetReferenceRole,
  ProjectAssetSourceType,
  ProjectAssetStatus,
  ProjectAssetVariantDto,
  ProjectAssetUsageProfileKey,
} from './projectAssetTypes';

export interface ProjectAssetRow {
  assetKey: string;
  displayName: string;
  originalFileName: string;
  fileKind: string;
  mimeType: string;
  fileExtension: string;
  sizeBytes: number | string;
  checksumSha256: string;
  storageBucket: string;
  storageObjectName: string;
  publicUrl: string;
  thumbnailUrl: string | null;
  width: number | string | null;
  height: number | string | null;
  durationMs: number | string | null;
  ownerModule: string;
  sourceType: string;
  status: string;
  tags: string[] | string | null;
  metadata: Record<string, unknown> | string | null;
  createdByUserId: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  deletedAt: Date | string | null;
  referenceCount?: number | string | null;
}

export interface ProjectAssetVariantRow {
  variantKey: string;
  assetKey: string;
  variantType: string;
  width: number | string | null;
  height: number | string | null;
  sizeBytes: number | string | null;
  storageObjectName: string;
  publicUrl: string;
  metadata: Record<string, unknown> | string | null;
  createdAt: Date | string | null;
}

export interface ProjectAssetReferenceRow {
  referenceKey: string;
  assetKey: string;
  ownerModule: string;
  entityType: string;
  entityKey: string;
  entityLabel: string;
  usageProfileKey: string;
  usageRole: string;
  usagePath: string;
  isBlockingDelete: number | boolean;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

export const toProjectAssetDto = (
  row: ProjectAssetRow,
  variants: ProjectAssetVariantDto[] = [],
): ProjectAssetDto => ({
  assetKey: row.assetKey,
  displayName: row.displayName,
  originalFileName: row.originalFileName,
  fileKind: normalizeFileKind(row.fileKind),
  mimeType: row.mimeType,
  fileExtension: row.fileExtension,
  sizeBytes: Number(row.sizeBytes) || 0,
  checksumSha256: row.checksumSha256,
  storageBucket: row.storageBucket,
  storageObjectName: row.storageObjectName,
  publicUrl: row.publicUrl,
  thumbnailUrl: row.thumbnailUrl,
  width: toNullableNumber(row.width),
  height: toNullableNumber(row.height),
  durationMs: toNullableNumber(row.durationMs),
  ownerModule: normalizeOwnerModule(row.ownerModule),
  sourceType: normalizeSourceType(row.sourceType),
  status: normalizeStatus(row.status),
  tags: normalizeTags(row.tags),
  metadata: normalizeRecord(row.metadata),
  createdByUserId: row.createdByUserId,
  createdAt: toIsoString(row.createdAt),
  updatedAt: toIsoString(row.updatedAt),
  deletedAt: toIsoString(row.deletedAt),
  variants,
  referenceCount: Number(row.referenceCount ?? 0) || 0,
});

export const toProjectAssetVariantDto = (row: ProjectAssetVariantRow): ProjectAssetVariantDto => ({
  variantKey: row.variantKey,
  assetKey: row.assetKey,
  variantType: row.variantType,
  width: toNullableNumber(row.width),
  height: toNullableNumber(row.height),
  sizeBytes: toNullableNumber(row.sizeBytes),
  storageObjectName: row.storageObjectName,
  publicUrl: row.publicUrl,
  metadata: normalizeRecord(row.metadata),
  createdAt: toIsoString(row.createdAt),
});

export const toProjectAssetReferenceDto = (row: ProjectAssetReferenceRow): ProjectAssetReferenceDto => ({
  referenceKey: row.referenceKey,
  assetKey: row.assetKey,
  ownerModule: normalizeOwnerModule(row.ownerModule),
  entityType: row.entityType,
  entityKey: row.entityKey,
  entityLabel: row.entityLabel,
  usageProfileKey: row.usageProfileKey as ProjectAssetUsageProfileKey,
  usageRole: row.usageRole as ProjectAssetReferenceRole,
  usagePath: row.usagePath,
  isBlockingDelete: row.isBlockingDelete === true || row.isBlockingDelete === 1,
  createdAt: toIsoString(row.createdAt),
  updatedAt: toIsoString(row.updatedAt),
});

export const normalizeRecord = (value: unknown): Record<string, unknown> | null => {
  const parsed = parseJsonColumn(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
};

const normalizeTags = (value: unknown): string[] => {
  const parsed = parseJsonColumn(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
};

const parseJsonColumn = (value: unknown): unknown | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  return value;
};

const toNullableNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
};

const toIsoString = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
};

const normalizeOwnerModule = (value: string): ProjectAssetOwnerModule => {
  if (value === 'lineRichMenu' || value === 'articleManagement') {
    return value;
  }

  return 'messageManagement';
};

const normalizeFileKind = (value: string): ProjectAssetFileKind => {
  if (value === 'document' || value === 'video' || value === 'audio' || value === 'other') {
    return value;
  }

  return 'image';
};

const normalizeSourceType = (value: string): ProjectAssetSourceType => {
  if (value === 'userUpload' || value === 'migration') {
    return value;
  }

  return 'adminUpload';
};

const normalizeStatus = (value: string): ProjectAssetStatus => {
  if (value === 'processing' || value === 'failed' || value === 'archived') {
    return value;
  }

  return 'active';
};
