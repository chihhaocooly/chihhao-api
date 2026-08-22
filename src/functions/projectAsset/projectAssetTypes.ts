export const projectAssetOwnerModules = [
  'messageManagement',
  'lineRichMenu',
  'articleManagement',
  'surveyManagement',
] as const;

export type ProjectAssetOwnerModule = typeof projectAssetOwnerModules[number];

export const projectAssetFileKinds = ['image', 'document', 'video', 'audio', 'other'] as const;

export type ProjectAssetFileKind = typeof projectAssetFileKinds[number];

export const projectAssetStatuses = ['active', 'processing', 'failed', 'archived'] as const;

export type ProjectAssetStatus = typeof projectAssetStatuses[number];

export const projectAssetSourceTypes = ['adminUpload', 'userUpload', 'migration'] as const;

export type ProjectAssetSourceType = typeof projectAssetSourceTypes[number];

export const projectAssetUsageProfileKeys = [
  'messageManagement.image',
  'messageManagement.flexCardHero',
  'messageManagement.imageCarousel',
  'messageManagement.imagemap',
  'lineRichMenu.richMenuImage',
  'articleManagement.coverImage',
  'surveyManagement.descriptionImage',
] as const;

export type ProjectAssetUsageProfileKey = typeof projectAssetUsageProfileKeys[number];

export type ProjectAssetReferenceRole =
  | 'messageImage'
  | 'flexImage'
  | 'carouselImage'
  | 'imagemap'
  | 'richMenuImage'
  | 'articleCover'
  | 'surveyDescriptionImage';

export interface ProjectAssetVariantDto {
  variantKey: string;
  assetKey: string;
  variantType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  storageObjectName: string;
  publicUrl: string;
  metadata: Record<string, unknown> | null;
  createdAt: string | null;
}

export interface ProjectAssetDto {
  assetKey: string;
  displayName: string;
  originalFileName: string;
  fileKind: ProjectAssetFileKind;
  mimeType: string;
  fileExtension: string;
  sizeBytes: number;
  checksumSha256: string;
  storageBucket: string;
  storageObjectName: string;
  publicUrl: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  ownerModule: ProjectAssetOwnerModule;
  sourceType: ProjectAssetSourceType;
  status: ProjectAssetStatus;
  tags: string[];
  metadata: Record<string, unknown> | null;
  createdByUserId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  variants: ProjectAssetVariantDto[];
  referenceCount: number;
}

export interface ProjectAssetReferenceDto {
  referenceKey: string;
  assetKey: string;
  ownerModule: ProjectAssetOwnerModule;
  entityType: string;
  entityKey: string;
  entityLabel: string;
  usageProfileKey: ProjectAssetUsageProfileKey;
  usageRole: ProjectAssetReferenceRole;
  usagePath: string;
  isBlockingDelete: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ProjectAssetUsageProfileDto {
  usageProfileKey: ProjectAssetUsageProfileKey;
  ownerModule: ProjectAssetOwnerModule;
  label: string;
  description: string;
  fileKind: ProjectAssetFileKind;
  allowedMimeTypes: string[];
  maxSizeBytes: number;
  minWidth: number | null;
  minHeight: number | null;
  maxWidth: number | null;
  maxHeight: number | null;
  exactWidth: number | null;
  exactHeight: number | null;
  aspectRatio: string | null;
  requiresImagemapVariants: boolean;
}

export interface ProjectAssetFieldError {
  field:
    | 'assetKey'
    | 'displayName'
    | 'file'
    | 'mimeType'
    | 'sizeBytes'
    | 'storageBucket'
    | 'usageProfileKey'
    | 'ownerModule'
    | 'metadata';
  message: string;
}

export interface ProjectAssetEligibilityResult {
  isEligible: boolean;
  reasons: string[];
}

export interface UploadProjectAssetInput {
  file: Express.Multer.File | undefined;
  usageProfileKey?: unknown;
  displayName?: unknown;
  tags?: unknown;
  createdByUserId: string | null;
}

export interface ListProjectAssetsOptions {
  q?: string;
  ownerModule?: ProjectAssetOwnerModule;
  fileKind?: ProjectAssetFileKind;
  usageProfileKey?: ProjectAssetUsageProfileKey;
  status?: ProjectAssetStatus;
  usedState?: 'all' | 'used' | 'unused';
  page?: number;
  pageSize?: number;
}

export interface UpdateProjectAssetInput {
  displayName?: unknown;
  tags?: unknown;
  status?: unknown;
  metadata?: unknown;
}

export interface ProjectAssetReferenceInput {
  assetKey: string;
  ownerModule: ProjectAssetOwnerModule;
  entityType: string;
  entityKey: string;
  entityLabel: string;
  usageProfileKey: ProjectAssetUsageProfileKey;
  usageRole: ProjectAssetReferenceRole;
  usagePath: string;
  isBlockingDelete?: boolean;
}
