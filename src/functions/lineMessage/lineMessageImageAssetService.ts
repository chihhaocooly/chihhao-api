import { Storage } from '@google-cloud/storage';
import { LineMessageImageAsset, LineMessageImageAssetRepository } from '@chihhaocooly/chihhao-package';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { LineMessageReferenceDto } from './lineMessageTypes';
import { toLineMessageImageAssetDto } from './lineMessageImageAssetMapper';

const defaultPage = 1;
const defaultPageSize = 20;
export const maxLineMessageImageBytes = 1024 * 1024;
export const allowedLineMessageImageMimeTypes = ['image/jpeg', 'image/png'] as const;

interface UploadLineMessageImageAssetInput {
  file: Express.Multer.File;
  createdByUserId: string | null;
}

export const listLineMessageImageAssets = async (options: { q?: string; page?: number; pageSize?: number }) => {
  const repository = new LineMessageImageAssetRepository();
  const page = Math.max(Number(options.page ?? defaultPage) || defaultPage, 1);
  const pageSize = Math.min(Math.max(Number(options.pageSize ?? defaultPageSize) || defaultPageSize, 1), 100);
  const result = await repository.findList({ q: options.q, page, pageSize });

  return {
    items: result.items.map(toLineMessageImageAssetDto),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
};

export const uploadLineMessageImageAsset = async (input: UploadLineMessageImageAssetInput) => {
  const fileValidationError = validateUploadFile(input.file);
  if (fileValidationError) {
    return { item: null, fieldErrors: [fileValidationError] };
  }

  const bucketName = readImageBucketName();
  if (!bucketName) {
    return { item: null, fieldErrors: [{ field: 'storageBucket', message: '圖片儲存空間尚未設定' }] };
  }

  const storage = new Storage();
  const storageObjectName = buildStorageObjectName(input.file.originalname, input.file.mimetype);
  const bucket = storage.bucket(bucketName);
  const storageFile = bucket.file(storageObjectName);

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

  const asset = new LineMessageImageAsset();
  asset.originalFileName = input.file.originalname;
  asset.contentType = input.file.mimetype;
  asset.sizeBytes = input.file.size;
  asset.storageBucket = bucketName;
  asset.storageObjectName = storageObjectName;
  asset.publicUrl = buildPublicUrl(bucketName, storageObjectName);
  asset.createdByUserId = input.createdByUserId;
  asset.createdAt = new Date();
  asset.updatedAt = new Date();
  asset.deletedAt = null;

  const savedAsset = await new LineMessageImageAssetRepository().create(asset);
  return { item: toLineMessageImageAssetDto(savedAsset), fieldErrors: [] };
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

const readImageAssetReferences = async (asset: LineMessageImageAsset): Promise<LineMessageReferenceDto[]> => {
  const messages = await new LineMessageImageAssetRepository().findReferencingLineMessages(asset);
  return messages.map((message) => ({
    type: 'imageAsset',
    label: `訊息素材：${message.title}`,
    lineMessageKey: message.lineMessageKey,
  }));
};

const validateUploadFile = (file: Express.Multer.File | undefined) => {
  if (!file) {
    return { field: 'file', message: '請選擇圖片檔案' };
  }

  if (!allowedLineMessageImageMimeTypes.includes(file.mimetype as typeof allowedLineMessageImageMimeTypes[number])) {
    return { field: 'contentType', message: '僅支援 JPEG 或 PNG 圖片' };
  }

  if (file.size <= 0 || file.size > maxLineMessageImageBytes) {
    return { field: 'sizeBytes', message: '圖片大小不可超過 1MB' };
  }

  return null;
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
