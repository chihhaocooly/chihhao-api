import { Storage } from '@google-cloud/storage';
import { AppDataSource, ProjectAssetReferenceRepository } from '@chihhaocooly/chihhao-package';
import { createHash, randomUUID } from 'crypto';
import { extname } from 'path';
import {
  ProjectAssetDto,
  ProjectAssetFieldError,
  ProjectAssetReferenceInput,
  ProjectAssetStatus,
  ProjectAssetUsageProfileKey,
  ProjectAssetVariantDto,
  UploadProjectAssetInput,
  ListProjectAssetsOptions,
  UpdateProjectAssetInput,
  projectAssetStatuses,
} from './projectAssetTypes';
import {
  ProjectAssetReferenceRow,
  ProjectAssetRow,
  ProjectAssetVariantRow,
  toProjectAssetDto,
  toProjectAssetReferenceDto,
  toProjectAssetVariantDto,
} from './projectAssetMapper';
import {
  evaluateProjectAssetEligibility,
  getProjectAssetUsageProfile,
  projectAssetUsageProfiles,
} from './projectAssetUsageProfiles';

const defaultPage = 1;
const defaultPageSize = 20;
const imagemapVariantWidths = [240, 300, 460, 700, 1040] as const;

interface ImageMetadata {
  width: number;
  height: number;
}

interface StoredAssetInput {
  assetKey: string;
  displayName: string;
  originalFileName: string;
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
  ownerModule: string;
  metadata: Record<string, unknown> | null;
  createdByUserId: string | null;
}

export const listProjectAssetUsageProfiles = () => {
  return { items: projectAssetUsageProfiles };
};

export const listProjectAssets = async (options: ListProjectAssetsOptions) => {
  const page = Math.max(Number(options.page ?? defaultPage) || defaultPage, 1);
  const pageSize = Math.min(Math.max(Number(options.pageSize ?? defaultPageSize) || defaultPageSize, 1), 100);
  const search = options.q?.trim().toLowerCase();
  const usageProfile = options.usageProfileKey
    ? getProjectAssetUsageProfile(options.usageProfileKey)
    : null;

  const rows = await AppDataSource.query(
    `SELECT asset.*,
      COUNT(ref.referenceKey) AS referenceCount
     FROM project_asset asset
     LEFT JOIN project_asset_reference ref ON ref.assetKey = asset.assetKey
     WHERE asset.deletedAt IS NULL
     GROUP BY asset.assetKey
     ORDER BY asset.updatedAt DESC, asset.createdAt DESC`
  ) as ProjectAssetRow[];

  const filtered = rows
    .map((row) => toProjectAssetDto(row))
    .filter((asset) => {
      if (options.ownerModule && asset.ownerModule !== options.ownerModule) {
        return false;
      }

      if (options.fileKind && asset.fileKind !== options.fileKind) {
        return false;
      }

      if (options.status && asset.status !== options.status) {
        return false;
      }

      if (options.usedState === 'used' && asset.referenceCount === 0) {
        return false;
      }

      if (options.usedState === 'unused' && asset.referenceCount > 0) {
        return false;
      }

      if (usageProfile && (asset.ownerModule !== usageProfile.ownerModule || asset.fileKind !== usageProfile.fileKind)) {
        return false;
      }

      if (!search) {
        return true;
      }

      return asset.displayName.toLowerCase().includes(search)
        || asset.originalFileName.toLowerCase().includes(search)
        || asset.mimeType.toLowerCase().includes(search)
        || asset.publicUrl.toLowerCase().includes(search)
        || asset.tags.some((tag) => tag.toLowerCase().includes(search));
    });

  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
};

export const getProjectAsset = async (assetKey: string) => {
  const asset = await readProjectAsset(assetKey);
  if (!asset) {
    return { missing: true, item: null };
  }

  return { missing: false, item: asset };
};

export const uploadProjectAsset = async (input: UploadProjectAssetInput) => {
  const usageProfile = getProjectAssetUsageProfile(input.usageProfileKey);
  if (!usageProfile) {
    return {
      item: null,
      fieldErrors: [{ field: 'usageProfileKey', message: '素材用途不支援' } as ProjectAssetFieldError],
    };
  }

  const fileValidationError = validateUploadFile(input.file, usageProfile.usageProfileKey);
  if (fileValidationError) {
    return { item: null, fieldErrors: [fileValidationError] };
  }

  const file = input.file as Express.Multer.File;
  const imageMetadata = await readImageMetadata(file);
  if (!imageMetadata) {
    return {
      item: null,
      fieldErrors: [{ field: 'file', message: '圖片內容無法解析' } as ProjectAssetFieldError],
    };
  }

  const bucketName = readAssetBucketName();
  if (!bucketName) {
    return {
      item: null,
      fieldErrors: [{ field: 'storageBucket', message: '素材儲存空間尚未設定' } as ProjectAssetFieldError],
    };
  }

  const profileCheckAsset = createValidationAsset(file, usageProfile.usageProfileKey, imageMetadata);
  const eligibility = evaluateProjectAssetEligibility(profileCheckAsset, usageProfile.usageProfileKey);
  if (!eligibility.isEligible) {
    return {
      item: null,
      fieldErrors: eligibility.reasons.map((message) => ({ field: 'file', message } as ProjectAssetFieldError)),
    };
  }

  const item = usageProfile.requiresImagemapVariants
    ? await uploadImagemapProjectAsset(input, bucketName, imageMetadata, usageProfile.usageProfileKey)
    : await uploadRegularProjectAsset(input, bucketName, imageMetadata, usageProfile.usageProfileKey);

  return { item, fieldErrors: [] as ProjectAssetFieldError[] };
};

export const updateProjectAsset = async (assetKey: string, input: UpdateProjectAssetInput) => {
  const asset = await readProjectAsset(assetKey);
  if (!asset) {
    return { missing: true, item: null, fieldErrors: [] as ProjectAssetFieldError[] };
  }

  const displayName = typeof input.displayName === 'string' && input.displayName.trim()
    ? input.displayName.trim().slice(0, 255)
    : asset.displayName;
  const tags = normalizeTagsInput(input.tags, asset.tags);
  const status = normalizeAssetStatus(input.status, asset.status);
  const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
    ? input.metadata as Record<string, unknown>
    : asset.metadata;

  await AppDataSource.query(
    `UPDATE project_asset
     SET displayName = ?, tags = ?, status = ?, metadata = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE assetKey = ? AND deletedAt IS NULL`,
    [
      displayName,
      JSON.stringify(tags),
      status,
      metadata ? JSON.stringify(metadata) : null,
      assetKey,
    ]
  );

  return { missing: false, item: await readProjectAsset(assetKey), fieldErrors: [] as ProjectAssetFieldError[] };
};

export const getProjectAssetReferences = async (assetKey: string) => {
  const asset = await readProjectAsset(assetKey);
  if (!asset) {
    return { missing: true, references: [] as ReturnType<typeof toProjectAssetReferenceDto>[], canDelete: false };
  }

  const references = await readProjectAssetReferences(assetKey);
  return {
    missing: false,
    references,
    canDelete: references.every((reference) => !reference.isBlockingDelete),
  };
};

export const deleteProjectAsset = async (assetKey: string) => {
  const asset = await readProjectAsset(assetKey);
  if (!asset) {
    return { missing: true, deleted: false, references: [] as ReturnType<typeof toProjectAssetReferenceDto>[] };
  }

  const references = await readProjectAssetReferences(assetKey);
  if (references.some((reference) => reference.isBlockingDelete)) {
    return { missing: false, deleted: false, references };
  }

  await AppDataSource.query(
    'UPDATE project_asset SET deletedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP WHERE assetKey = ?',
    [assetKey]
  );
  return { missing: false, deleted: true, references };
};

export const replaceProjectAssetReferencesForEntity = async (
  entityType: string,
  entityKey: string,
  references: ProjectAssetReferenceInput[],
): Promise<void> => {
  await new ProjectAssetReferenceRepository().replaceForEntity(entityType, entityKey, references);
};

export const deleteProjectAssetReferencesForEntity = async (entityType: string, entityKey: string) => {
  await AppDataSource.query('DELETE FROM project_asset_reference WHERE entityType = ? AND entityKey = ?', [entityType, entityKey]);
};

export const readProjectAsset = async (assetKey: string): Promise<ProjectAssetDto | null> => {
  const rows = await AppDataSource.query(
    `SELECT asset.*,
      COUNT(ref.referenceKey) AS referenceCount
     FROM project_asset asset
     LEFT JOIN project_asset_reference ref ON ref.assetKey = asset.assetKey
     WHERE asset.assetKey = ? AND asset.deletedAt IS NULL
     GROUP BY asset.assetKey`,
    [assetKey]
  ) as ProjectAssetRow[];

  if (rows.length === 0) {
    return null;
  }

  const variants = await readProjectAssetVariants(assetKey);
  return toProjectAssetDto(rows[0], variants);
};

const readProjectAssetVariants = async (assetKey: string): Promise<ProjectAssetVariantDto[]> => {
  const rows = await AppDataSource.query(
    'SELECT * FROM project_asset_variant WHERE assetKey = ? ORDER BY variantType ASC, createdAt ASC',
    [assetKey]
  ) as ProjectAssetVariantRow[];
  return rows.map(toProjectAssetVariantDto);
};

const readProjectAssetReferences = async (assetKey: string) => {
  const rows = await AppDataSource.query(
    'SELECT * FROM project_asset_reference WHERE assetKey = ? ORDER BY updatedAt DESC, createdAt DESC',
    [assetKey]
  ) as ProjectAssetReferenceRow[];
  return rows.map(toProjectAssetReferenceDto);
};

const uploadRegularProjectAsset = async (
  input: UploadProjectAssetInput,
  bucketName: string,
  imageMetadata: ImageMetadata,
  usageProfileKey: ProjectAssetUsageProfileKey,
): Promise<ProjectAssetDto> => {
  const file = input.file as Express.Multer.File;
  const storage = new Storage();
  const assetKey = randomUUID();
  const storageObjectName = buildStorageObjectName(file.originalname, file.mimetype, usageProfileKey, assetKey);
  const storageFile = storage.bucket(bucketName).file(storageObjectName);

  await storageFile.save(file.buffer, {
    resumable: false,
    metadata: {
      contentType: file.mimetype,
      cacheControl: 'public, max-age=31536000',
    },
  });

  if (process.env.PROJECT_ASSET_MAKE_PUBLIC === 'true' || process.env.LINE_MESSAGE_IMAGE_MAKE_PUBLIC === 'true') {
    await storageFile.makePublic();
  }

  await insertProjectAsset({
    assetKey,
    displayName: readDisplayName(input.displayName, file.originalname),
    originalFileName: file.originalname,
    mimeType: file.mimetype,
    fileExtension: readImageExtension(file.originalname, file.mimetype),
    sizeBytes: file.size,
    checksumSha256: createSha256(file.buffer),
    storageBucket: bucketName,
    storageObjectName,
    publicUrl: buildPublicUrl(bucketName, storageObjectName),
    thumbnailUrl: buildPublicUrl(bucketName, storageObjectName),
    width: imageMetadata.width,
    height: imageMetadata.height,
    ownerModule: getProjectAssetUsageProfile(usageProfileKey)?.ownerModule ?? 'messageManagement',
    metadata: { usageProfileKey },
    createdByUserId: input.createdByUserId,
  }, input.tags);

  const asset = await readProjectAsset(assetKey);
  if (!asset) {
    throw new Error('Project asset was not created');
  }

  return asset;
};

const uploadImagemapProjectAsset = async (
  input: UploadProjectAssetInput,
  bucketName: string,
  imageMetadata: ImageMetadata,
  usageProfileKey: ProjectAssetUsageProfileKey,
): Promise<ProjectAssetDto> => {
  const file = input.file as Express.Multer.File;
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);
  const assetKey = randomUUID();
  const prefix = buildImagemapStoragePrefix(usageProfileKey, assetKey);
  const imagemapBaseUrl = buildPublicUrl(bucketName, prefix);
  const outputFormat = file.mimetype === 'image/png' ? 'png' : 'jpeg';
  const variantInputs: Array<{
    variantType: string;
    width: number;
    height: number;
    sizeBytes: number;
    storageObjectName: string;
    publicUrl: string;
  }> = [];

  for (const width of imagemapVariantWidths) {
    const storageObjectName = `${prefix}/${width}`;
    const height = Math.round((width / imageMetadata.width) * imageMetadata.height);
    const sharp = await readSharp();
    const variantBuffer = await sharp(file.buffer)
      .resize({ width })
      .toFormat(outputFormat)
      .toBuffer();
    const storageFile = bucket.file(storageObjectName);

    await storageFile.save(variantBuffer, {
      resumable: false,
      metadata: {
        contentType: file.mimetype,
        cacheControl: 'public, max-age=31536000',
      },
    });

    if (process.env.PROJECT_ASSET_MAKE_PUBLIC === 'true' || process.env.LINE_MESSAGE_IMAGE_MAKE_PUBLIC === 'true') {
      await storageFile.makePublic();
    }

    variantInputs.push({
      variantType: `imagemap-${width}`,
      width,
      height,
      sizeBytes: variantBuffer.byteLength,
      storageObjectName,
      publicUrl: buildPublicUrl(bucketName, storageObjectName),
    });
  }

  const baseSizeHeight = Math.round((1040 / imageMetadata.width) * imageMetadata.height);
  await insertProjectAsset({
    assetKey,
    displayName: readDisplayName(input.displayName, file.originalname),
    originalFileName: file.originalname,
    mimeType: file.mimetype,
    fileExtension: readImageExtension(file.originalname, file.mimetype),
    sizeBytes: file.size,
    checksumSha256: createSha256(file.buffer),
    storageBucket: bucketName,
    storageObjectName: `${prefix}/1040`,
    publicUrl: variantInputs.find((variant) => variant.width === 1040)?.publicUrl ?? buildPublicUrl(bucketName, `${prefix}/1040`),
    thumbnailUrl: variantInputs.find((variant) => variant.width === 300)?.publicUrl ?? null,
    width: imageMetadata.width,
    height: imageMetadata.height,
    ownerModule: getProjectAssetUsageProfile(usageProfileKey)?.ownerModule ?? 'messageManagement',
    metadata: {
      usageProfileKey,
      imagemapBaseUrl,
      imagemapBaseSizeWidth: 1040,
      imagemapBaseSizeHeight: baseSizeHeight,
    },
    createdByUserId: input.createdByUserId,
  }, input.tags);

  for (const variant of variantInputs) {
    await AppDataSource.query(
      `INSERT INTO project_asset_variant
        (variantKey, assetKey, variantType, width, height, sizeBytes, storageObjectName, publicUrl, metadata, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        randomUUID(),
        assetKey,
        variant.variantType,
        variant.width,
        variant.height,
        variant.sizeBytes,
        variant.storageObjectName,
        variant.publicUrl,
        JSON.stringify({ usageProfileKey }),
      ]
    );
  }

  const asset = await readProjectAsset(assetKey);
  if (!asset) {
    throw new Error('Project asset was not created');
  }

  return asset;
};

const insertProjectAsset = async (asset: StoredAssetInput, tagsInput: unknown) => {
  const tags = normalizeTagsInput(tagsInput, []);

  await AppDataSource.query(
    `INSERT INTO project_asset
      (assetKey, displayName, originalFileName, fileKind, mimeType, fileExtension, sizeBytes,
        checksumSha256, storageBucket, storageObjectName, publicUrl, thumbnailUrl, width, height,
        durationMs, ownerModule, sourceType, status, tags, metadata, createdByUserId,
        createdAt, updatedAt, deletedAt)
     VALUES (?, ?, ?, 'image', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'adminUpload', 'active', ?, ?, ?,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
    [
      asset.assetKey,
      asset.displayName,
      asset.originalFileName,
      asset.mimeType,
      asset.fileExtension,
      asset.sizeBytes,
      asset.checksumSha256,
      asset.storageBucket,
      asset.storageObjectName,
      asset.publicUrl,
      asset.thumbnailUrl,
      asset.width,
      asset.height,
      asset.ownerModule,
      JSON.stringify(tags),
      asset.metadata ? JSON.stringify(asset.metadata) : null,
      asset.createdByUserId,
    ]
  );
};

const validateUploadFile = (
  file: Express.Multer.File | undefined,
  usageProfileKey: ProjectAssetUsageProfileKey,
): ProjectAssetFieldError | null => {
  const usageProfile = getProjectAssetUsageProfile(usageProfileKey);
  if (!usageProfile) {
    return { field: 'usageProfileKey', message: '素材用途不支援' };
  }

  if (!file) {
    return { field: 'file', message: '請選擇素材檔案' };
  }

  if (!usageProfile.allowedMimeTypes.includes(file.mimetype)) {
    return { field: 'mimeType', message: '檔案格式不符合目前用途' };
  }

  if (file.size <= 0 || file.size > usageProfile.maxSizeBytes) {
    const maxMb = Math.round(usageProfile.maxSizeBytes / 1024 / 1024);
    return { field: 'sizeBytes', message: `檔案大小不可超過 ${maxMb}MB` };
  }

  return null;
};

const createValidationAsset = (
  file: Express.Multer.File,
  usageProfileKey: ProjectAssetUsageProfileKey,
  imageMetadata: ImageMetadata,
): ProjectAssetDto => {
  const usageProfile = getProjectAssetUsageProfile(usageProfileKey);

  return {
    assetKey: 'upload-preview',
    displayName: file.originalname,
    originalFileName: file.originalname,
    fileKind: 'image',
    mimeType: file.mimetype,
    fileExtension: readImageExtension(file.originalname, file.mimetype),
    sizeBytes: file.size,
    checksumSha256: '',
    storageBucket: '',
    storageObjectName: '',
    publicUrl: '',
    thumbnailUrl: null,
    width: imageMetadata.width,
    height: imageMetadata.height,
    durationMs: null,
    ownerModule: usageProfile?.ownerModule ?? 'messageManagement',
    sourceType: 'adminUpload',
    status: 'active',
    tags: [],
    metadata: usageProfile?.requiresImagemapVariants ? { imagemapBaseUrl: 'pending' } : null,
    createdByUserId: null,
    createdAt: null,
    updatedAt: null,
    deletedAt: null,
    variants: [],
    referenceCount: 0,
  };
};

const readImageMetadata = async (file: Express.Multer.File): Promise<ImageMetadata | null> => {
  try {
    const sharp = await readSharp();
    const metadata = await sharp(file.buffer).metadata();
    if (!metadata.width || !metadata.height) {
      return null;
    }

    return {
      width: metadata.width,
      height: metadata.height,
    };
  } catch {
    return null;
  }
};

const readSharp = async () => {
  const sharpModule = await import('sharp');
  return sharpModule.default;
};

const normalizeTagsInput = (value: unknown, fallback: string[]): string[] => {
  if (Array.isArray(value)) {
    return Array.from(new Set(
      value
        .map((item) => typeof item === 'string' ? item.trim() : '')
        .filter((item) => item.length > 0)
    )).slice(0, 20);
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return normalizeTagsInput(parsed, fallback);
    } catch {
      return value.split(',').map((item) => item.trim()).filter((item) => item.length > 0).slice(0, 20);
    }
  }

  return fallback;
};

const normalizeAssetStatus = (value: unknown, fallback: ProjectAssetStatus): ProjectAssetStatus => {
  return typeof value === 'string' && projectAssetStatuses.includes(value as ProjectAssetStatus)
    ? value as ProjectAssetStatus
    : fallback;
};

const readAssetBucketName = (): string | null => {
  const bucketName = process.env.PROJECT_ASSET_BUCKET
    || process.env.LINE_MESSAGE_IMAGE_BUCKET
    || process.env.GCP_STORAGE_BUCKET;
  return bucketName?.trim() || null;
};

const readDisplayName = (value: unknown, fallback: string): string => {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 255)
    : fallback.slice(0, 255);
};

const buildStorageObjectName = (
  originalFileName: string,
  mimeType: string,
  usageProfileKey: ProjectAssetUsageProfileKey,
  assetKey: string,
): string => {
  const extension = readImageExtension(originalFileName, mimeType);
  const today = new Date().toISOString().slice(0, 10);
  return `assets/${usageProfileKey.replace('.', '/')}/${today}/${assetKey}${extension}`;
};

const buildImagemapStoragePrefix = (usageProfileKey: ProjectAssetUsageProfileKey, assetKey: string): string => {
  const today = new Date().toISOString().slice(0, 10);
  return `assets/${usageProfileKey.replace('.', '/')}/${today}/${assetKey}`;
};

const readImageExtension = (originalFileName: string, mimeType: string): string => {
  const sourceExtension = extname(originalFileName).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(sourceExtension)) {
    return sourceExtension;
  }

  if (mimeType === 'image/png') {
    return '.png';
  }

  if (mimeType === 'image/webp') {
    return '.webp';
  }

  return '.jpg';
};

const createSha256 = (buffer: Buffer): string => {
  return createHash('sha256').update(buffer).digest('hex');
};

const buildPublicUrl = (bucketName: string, storageObjectName: string): string => {
  const publicBaseUrl = (process.env.PROJECT_ASSET_PUBLIC_BASE_URL || process.env.LINE_MESSAGE_IMAGE_PUBLIC_BASE_URL)?.replace(/\/$/, '');
  if (publicBaseUrl) {
    return `${publicBaseUrl}/${encodeStorageObjectName(storageObjectName)}`;
  }

  return `https://storage.googleapis.com/${bucketName}/${encodeStorageObjectName(storageObjectName)}`;
};

const encodeStorageObjectName = (storageObjectName: string): string => {
  return storageObjectName.split('/').map(encodeURIComponent).join('/');
};
