import { Storage } from '@google-cloud/storage';
import { AppDataSource, LineMessageImageAsset, LineMessageImageAssetRepository } from '@chihhaocooly/chihhao-package';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import sharp from 'sharp';
import { toLineMessageImageAssetDto } from './lineMessageImageAssetMapper';
import { readLineMessageImageAssetReferences } from './lineMessagePersistenceHelpers';
import {
  LINE_MESSAGE_IMAGE_ASSET_KINDS,
  LineMessageFieldError,
  LineMessageImageAssetDto,
  LineMessageImageAssetKind,
  LineMessageImageVariantsDto,
  LineMessageReferenceDto,
} from './lineMessageTypes';

const defaultPage = 1;
const defaultPageSize = 20;
const imagemapVariantWidths = [240, 300, 460, 700, 1040] as const;

export const maxLineMessageImageBytes = 1024 * 1024;
export const maxLineMessageImagemapImageBytes = 10 * 1024 * 1024;
export const allowedLineMessageImageMimeTypes = ['image/jpeg', 'image/png'] as const;

interface UploadLineMessageImageAssetInput {
  file: Express.Multer.File;
  assetKind?: unknown;
  createdByUserId: string | null;
}

interface ImageMetadata {
  width: number;
  height: number;
}

type LineMessageImageAssetEntity = LineMessageImageAsset & {
  assetKind?: LineMessageImageAssetKind | string | null;
  width?: number | string | null;
  height?: number | string | null;
  imagemapBaseUrl?: string | null;
  imagemapBaseSizeWidth?: number | string | null;
  imagemapBaseSizeHeight?: number | string | null;
  imageVariants?: LineMessageImageVariantsDto | string | null;
};

export const listLineMessageImageAssets = async (
  options: { q?: string; assetKind?: LineMessageImageAssetKind; page?: number; pageSize?: number }
) => {
  const page = Math.max(Number(options.page ?? defaultPage) || defaultPage, 1);
  const pageSize = Math.min(Math.max(Number(options.pageSize ?? defaultPageSize) || defaultPageSize, 1), 100);
  const allAssets = await readAllImageAssets(options.q);
  const filteredAssets = options.assetKind
    ? allAssets.filter((asset) => toLineMessageImageAssetDto(asset).assetKind === options.assetKind)
    : allAssets;
  const start = (page - 1) * pageSize;

  return {
    items: filteredAssets.slice(start, start + pageSize).map(toLineMessageImageAssetDto),
    total: filteredAssets.length,
    page,
    pageSize,
  };
};

export const uploadLineMessageImageAsset = async (input: UploadLineMessageImageAssetInput) => {
  const assetKind = normalizeAssetKind(input.assetKind);
  if (!assetKind) {
    return { item: null, fieldErrors: [{ field: 'assetKind', message: '圖片資產類型不支援' } as LineMessageFieldError] };
  }

  const fileValidationError = validateUploadFile(input.file, assetKind);
  if (fileValidationError) {
    return { item: null, fieldErrors: [fileValidationError] };
  }

  const imageMetadata = await readImageMetadata(input.file);
  if (!imageMetadata) {
    return { item: null, fieldErrors: [{ field: 'file', message: '圖片內容無法解析' } as LineMessageFieldError] };
  }

  const bucketName = readImageBucketName();
  if (!bucketName) {
    return { item: null, fieldErrors: [{ field: 'storageBucket', message: '圖片儲存空間尚未設定' } as LineMessageFieldError] };
  }

  const item = assetKind === 'imagemap'
    ? await uploadImagemapAsset(input, bucketName, imageMetadata)
    : await uploadMessageImageAsset(input, bucketName, imageMetadata);

  return { item, fieldErrors: [] };
};

export const getLineMessageImageAssetReferences = async (imageAssetKey: string) => {
  const asset = await new LineMessageImageAssetRepository().findByImageAssetKey(imageAssetKey);
  if (!asset || asset.deletedAt) {
    return { missing: true, references: [] as LineMessageReferenceDto[], canDelete: false };
  }

  const references = await readImageAssetReferences(asset);
  return { missing: false, references, canDelete: references.length === 0 };
};

export const deleteLineMessageImageAsset = async (imageAssetKey: string) => {
  const repository = new LineMessageImageAssetRepository();
  const asset = await repository.findByImageAssetKey(imageAssetKey);
  if (!asset || asset.deletedAt) {
    return { missing: true, deleted: false, references: [] as LineMessageReferenceDto[] };
  }

  const references = await readImageAssetReferences(asset);
  if (references.length > 0) {
    return { missing: false, deleted: false, references };
  }

  await repository.softDelete(asset);
  return { missing: false, deleted: true, references };
};

const uploadMessageImageAsset = async (
  input: UploadLineMessageImageAssetInput,
  bucketName: string,
  imageMetadata: ImageMetadata,
): Promise<LineMessageImageAssetDto> => {
  const storage = new Storage();
  const storageObjectName = buildStorageObjectName(input.file.originalname, input.file.mimetype);
  const storageFile = storage.bucket(bucketName).file(storageObjectName);

  await storageFile.save(input.file.buffer, {
    resumable: false,
    metadata: {
      contentType: input.file.mimetype,
      cacheControl: 'public, max-age=31536000',
    },
  });

  if (process.env.LINE_MESSAGE_IMAGE_MAKE_PUBLIC === 'true') {
    await storageFile.makePublic();
  }

  const asset = new LineMessageImageAsset() as LineMessageImageAssetEntity;
  asset.originalFileName = input.file.originalname;
  asset.contentType = input.file.mimetype;
  asset.sizeBytes = input.file.size;
  asset.assetKind = 'messageImage';
  asset.storageBucket = bucketName;
  asset.storageObjectName = storageObjectName;
  asset.publicUrl = buildPublicUrl(bucketName, storageObjectName);
  asset.width = imageMetadata.width;
  asset.height = imageMetadata.height;
  asset.imagemapBaseUrl = null;
  asset.imagemapBaseSizeWidth = null;
  asset.imagemapBaseSizeHeight = null;
  asset.imageVariants = null;
  asset.createdByUserId = input.createdByUserId;
  asset.createdAt = new Date();
  asset.updatedAt = new Date();
  asset.deletedAt = null;

  const savedAsset = await new LineMessageImageAssetRepository().create(asset);
  await updateImageAssetMetadata(savedAsset.imageAssetKey, asset);
  const [hydratedAsset] = await hydrateImageAssetMetadata([savedAsset as LineMessageImageAssetEntity]);
  return toLineMessageImageAssetDto(hydratedAsset);
};

const uploadImagemapAsset = async (
  input: UploadLineMessageImageAssetInput,
  bucketName: string,
  imageMetadata: ImageMetadata,
): Promise<LineMessageImageAssetDto> => {
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);
  const prefix = buildImagemapStoragePrefix();
  const baseUrl = buildPublicUrl(bucketName, prefix);
  const outputFormat = input.file.mimetype === 'image/png' ? 'png' : 'jpeg';
  const imageVariants: LineMessageImageVariantsDto = {};

  for (const width of imagemapVariantWidths) {
    const storageObjectName = `${prefix}/${width}`;
    const height = Math.round((width / imageMetadata.width) * imageMetadata.height);
    const variantBuffer = await sharp(input.file.buffer)
      .resize({ width })
      .toFormat(outputFormat)
      .toBuffer();
    const storageFile = bucket.file(storageObjectName);

    await storageFile.save(variantBuffer, {
      resumable: false,
      metadata: {
        contentType: input.file.mimetype,
        cacheControl: 'public, max-age=31536000',
      },
    });

    if (process.env.LINE_MESSAGE_IMAGE_MAKE_PUBLIC === 'true') {
      await storageFile.makePublic();
    }

    imageVariants[String(width)] = {
      width,
      height,
      storageObjectName,
      publicUrl: buildPublicUrl(bucketName, storageObjectName),
    };
  }

  const baseSizeHeight = Math.round((1040 / imageMetadata.width) * imageMetadata.height);
  const asset = new LineMessageImageAsset() as LineMessageImageAssetEntity;
  asset.originalFileName = input.file.originalname;
  asset.contentType = input.file.mimetype;
  asset.sizeBytes = input.file.size;
  asset.assetKind = 'imagemap';
  asset.storageBucket = bucketName;
  asset.storageObjectName = `${prefix}/1040`;
  asset.publicUrl = imageVariants['1040'].publicUrl;
  asset.width = imageMetadata.width;
  asset.height = imageMetadata.height;
  asset.imagemapBaseUrl = baseUrl;
  asset.imagemapBaseSizeWidth = 1040;
  asset.imagemapBaseSizeHeight = baseSizeHeight;
  asset.imageVariants = imageVariants;
  asset.createdByUserId = input.createdByUserId;
  asset.createdAt = new Date();
  asset.updatedAt = new Date();
  asset.deletedAt = null;

  const savedAsset = await new LineMessageImageAssetRepository().create(asset);
  await updateImageAssetMetadata(savedAsset.imageAssetKey, asset);
  const [hydratedAsset] = await hydrateImageAssetMetadata([savedAsset as LineMessageImageAssetEntity]);
  return toLineMessageImageAssetDto(hydratedAsset);
};

const readAllImageAssets = async (q?: string): Promise<LineMessageImageAssetEntity[]> => {
  try {
    const rows = await AppDataSource.query(
      'SELECT * FROM line_message_image_asset WHERE deletedAt IS NULL ORDER BY updatedAt DESC, createdAt DESC'
    ) as LineMessageImageAssetEntity[];
    const search = q?.trim().toLowerCase();

    if (!search) {
      return rows;
    }

    return rows.filter((asset) => {
      return asset.originalFileName.toLowerCase().includes(search)
        || asset.contentType.toLowerCase().includes(search)
        || asset.publicUrl.toLowerCase().includes(search)
        || (asset.imagemapBaseUrl?.toLowerCase().includes(search) ?? false);
    });
  } catch {
    const result = await new LineMessageImageAssetRepository().findList({ q, page: 1, pageSize: 100 });
    return await hydrateImageAssetMetadata(result.items as LineMessageImageAssetEntity[]);
  }
};

const hydrateImageAssetMetadata = async <T extends LineMessageImageAssetEntity>(assets: T[]): Promise<T[]> => {
  if (assets.length === 0) {
    return assets;
  }

  try {
    const keys = assets.map((asset) => asset.imageAssetKey);
    const rows = await AppDataSource.query(
      `SELECT imageAssetKey, assetKind, width, height, imagemapBaseUrl,
        imagemapBaseSizeWidth, imagemapBaseSizeHeight, imageVariants
       FROM line_message_image_asset WHERE imageAssetKey IN (?)`,
      [keys]
    ) as LineMessageImageAssetEntity[];
    const rowMap = new Map(rows.map((row) => [row.imageAssetKey, row]));

    for (const asset of assets) {
      const row = rowMap.get(asset.imageAssetKey);
      if (!row) {
        continue;
      }

      asset.assetKind = row.assetKind;
      asset.width = row.width;
      asset.height = row.height;
      asset.imagemapBaseUrl = row.imagemapBaseUrl;
      asset.imagemapBaseSizeWidth = row.imagemapBaseSizeWidth;
      asset.imagemapBaseSizeHeight = row.imagemapBaseSizeHeight;
      asset.imageVariants = parseJsonColumn(row.imageVariants) as LineMessageImageVariantsDto | null;
    }
  } catch {
    // Ignore until the DB migration is applied.
  }

  return assets;
};

const updateImageAssetMetadata = async (imageAssetKey: string, asset: LineMessageImageAssetEntity) => {
  try {
    await AppDataSource.query(
      `UPDATE line_message_image_asset
       SET assetKind = ?, width = ?, height = ?, imagemapBaseUrl = ?,
         imagemapBaseSizeWidth = ?, imagemapBaseSizeHeight = ?, imageVariants = ?
       WHERE imageAssetKey = ?`,
      [
        asset.assetKind ?? 'messageImage',
        asset.width ?? null,
        asset.height ?? null,
        asset.imagemapBaseUrl ?? null,
        asset.imagemapBaseSizeWidth ?? null,
        asset.imagemapBaseSizeHeight ?? null,
        asset.imageVariants ? JSON.stringify(asset.imageVariants) : null,
        imageAssetKey,
      ]
    );
  } catch {
    // Ignore until the DB migration is applied.
  }
};

const readImageAssetReferences = async (asset: LineMessageImageAsset): Promise<LineMessageReferenceDto[]> => {
  const referenceRows = await readLineMessageImageAssetReferences(asset.imageAssetKey);
  if (referenceRows.length > 0) {
    return referenceRows;
  }

  const messages = await new LineMessageImageAssetRepository().findReferencingLineMessages(asset);
  return messages.map((message) => ({
    type: 'imageAsset',
    label: `訊息素材：${message.title}`,
    lineMessageKey: message.lineMessageKey,
  }));
};

const validateUploadFile = (
  file: Express.Multer.File | undefined,
  assetKind: LineMessageImageAssetKind,
): LineMessageFieldError | null => {
  if (!file) {
    return { field: 'file', message: '請選擇圖片檔案' };
  }

  if (!allowedLineMessageImageMimeTypes.includes(file.mimetype as typeof allowedLineMessageImageMimeTypes[number])) {
    return { field: 'contentType', message: '僅支援 JPEG 或 PNG 圖片' };
  }

  const maxBytes = assetKind === 'imagemap' ? maxLineMessageImagemapImageBytes : maxLineMessageImageBytes;
  if (file.size <= 0 || file.size > maxBytes) {
    const maxMb = assetKind === 'imagemap' ? '10MB' : '1MB';
    return { field: 'sizeBytes', message: `圖片大小不可超過 ${maxMb}` };
  }

  return null;
};

const readImageMetadata = async (file: Express.Multer.File): Promise<ImageMetadata | null> => {
  try {
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

const normalizeAssetKind = (value: unknown): LineMessageImageAssetKind | null => {
  if (value === undefined || value === null || value === '') {
    return 'messageImage';
  }

  return typeof value === 'string' && LINE_MESSAGE_IMAGE_ASSET_KINDS.includes(value as LineMessageImageAssetKind)
    ? value as LineMessageImageAssetKind
    : null;
};

const readImageBucketName = (): string | null => {
  const bucketName = process.env.LINE_MESSAGE_IMAGE_BUCKET || process.env.GCP_STORAGE_BUCKET;
  return bucketName?.trim() || null;
};

const buildStorageObjectName = (originalFileName: string, contentType: string): string => {
  const extension = readImageExtension(originalFileName, contentType);
  const today = new Date().toISOString().slice(0, 10);
  return `line-message/images/${today}/${randomUUID()}${extension}`;
};

const buildImagemapStoragePrefix = (): string => {
  const today = new Date().toISOString().slice(0, 10);
  return `line-message/imagemap/${today}/${randomUUID()}`;
};

const readImageExtension = (originalFileName: string, contentType: string): string => {
  const sourceExtension = extname(originalFileName).toLowerCase();
  if (['.jpg', '.jpeg', '.png'].includes(sourceExtension)) {
    return sourceExtension;
  }

  return contentType === 'image/png' ? '.png' : '.jpg';
};

const buildPublicUrl = (bucketName: string, storageObjectName: string): string => {
  const publicBaseUrl = process.env.LINE_MESSAGE_IMAGE_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (publicBaseUrl) {
    return `${publicBaseUrl}/${encodeStorageObjectName(storageObjectName)}`;
  }

  return `https://storage.googleapis.com/${bucketName}/${encodeStorageObjectName(storageObjectName)}`;
};

const encodeStorageObjectName = (storageObjectName: string): string => {
  return storageObjectName.split('/').map(encodeURIComponent).join('/');
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
