import { AppDataSource } from '@chihhaocooly/chihhao-package';
import { randomUUID } from 'crypto';
import {
  LineMessageEntity,
  LineMessageImageAssetReferenceRole,
  LineMessageReferenceDto,
  LineMessageTemplateKey,
} from './lineMessageTypes';
import { isLineMessageTemplateKey } from './lineMessageValidator';

interface EditorMetadataRow {
  lineMessageKey: string;
  templateKey: string | null;
  editorPayload: unknown | string | null;
  editorPayloadVersion: number | string | null;
}

interface ImageAssetReferenceRow {
  lineMessageKey: string;
  title: string;
  referenceRole: string;
}

interface ImageAssetReferenceInput {
  imageAssetKey: string;
  referenceRole: LineMessageImageAssetReferenceRole;
}

export const hydrateLineMessageEditorMetadata = async <T extends LineMessageEntity>(messages: T[]): Promise<T[]> => {
  if (messages.length === 0) {
    return messages;
  }

  try {
    const keys = messages.map((message) => message.lineMessageKey);
    const rows = await AppDataSource.query(
      'SELECT lineMessageKey, templateKey, editorPayload, editorPayloadVersion FROM line_message WHERE lineMessageKey IN (?)',
      [keys]
    ) as EditorMetadataRow[];
    const rowMap = new Map(rows.map((row) => [row.lineMessageKey, row]));

    for (const message of messages) {
      const row = rowMap.get(message.lineMessageKey);
      if (!row) {
        continue;
      }

      message.templateKey = typeof row.templateKey === 'string' && isLineMessageTemplateKey(row.templateKey)
        ? row.templateKey
        : null;
      message.editorPayload = parseEditorPayloadColumn(row.editorPayload);
      message.editorPayloadVersion = normalizeEditorPayloadVersion(row.editorPayloadVersion);
    }
  } catch {
    // The API can be deployed before the migration; keep old payload behavior working.
  }

  return messages;
};

export const updateLineMessageEditorMetadata = async (
  lineMessageKey: string,
  templateKey: LineMessageTemplateKey | null,
  editorPayload: unknown | null,
  editorPayloadVersion: number,
) => {
  try {
    await AppDataSource.query(
      'UPDATE line_message SET templateKey = ?, editorPayload = ?, editorPayloadVersion = ? WHERE lineMessageKey = ?',
      [
        templateKey,
        editorPayload === null ? null : JSON.stringify(editorPayload),
        editorPayloadVersion,
        lineMessageKey,
      ]
    );
  } catch {
    // Ignore until the DB migration is applied.
  }
};

export const syncLineMessageImageAssetReferences = async (
  lineMessageKey: string,
  templateKey: LineMessageTemplateKey | null,
  editorPayload: unknown | null,
) => {
  const references = extractImageAssetReferences(templateKey, editorPayload);

  try {
    await AppDataSource.query('DELETE FROM line_message_image_asset_reference WHERE lineMessageKey = ?', [lineMessageKey]);

    if (references.length === 0) {
      return;
    }

    for (const reference of references) {
      await AppDataSource.query(
        `INSERT INTO line_message_image_asset_reference
          (referenceKey, lineMessageKey, imageAssetKey, referenceRole, createdAt)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [randomUUID(), lineMessageKey, reference.imageAssetKey, reference.referenceRole]
      );
    }
  } catch {
    // The reference table is additive; saving the message must not fail before migration.
  }
};

export const deleteLineMessageImageAssetReferences = async (lineMessageKey: string) => {
  try {
    await AppDataSource.query('DELETE FROM line_message_image_asset_reference WHERE lineMessageKey = ?', [lineMessageKey]);
  } catch {
    // Ignore until the DB migration is applied.
  }
};

export const readLineMessageImageAssetReferences = async (imageAssetKey: string): Promise<LineMessageReferenceDto[]> => {
  try {
    const rows = await AppDataSource.query(
      `SELECT ref.lineMessageKey, ref.referenceRole, msg.title
       FROM line_message_image_asset_reference ref
       INNER JOIN line_message msg ON msg.lineMessageKey = ref.lineMessageKey
       WHERE ref.imageAssetKey = ?
       ORDER BY ref.createdAt DESC`,
      [imageAssetKey]
    ) as ImageAssetReferenceRow[];

    return rows.map((row) => ({
      type: 'imageAsset',
      label: `訊息素材：${row.title}（${formatReferenceRole(row.referenceRole)}）`,
      lineMessageKey: row.lineMessageKey,
    }));
  } catch {
    return [];
  }
};

const extractImageAssetReferences = (
  templateKey: LineMessageTemplateKey | null,
  editorPayload: unknown | null,
): ImageAssetReferenceInput[] => {
  const imageAssetKeys = new Set<string>();
  collectImageAssetKeys(editorPayload, imageAssetKeys);
  const referenceRole = toReferenceRole(templateKey, editorPayload);

  return Array.from(imageAssetKeys).map((imageAssetKey) => ({
    imageAssetKey,
    referenceRole,
  }));
};

const collectImageAssetKeys = (value: unknown, keys: Set<string>) => {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageAssetKeys(item, keys);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if ((key === 'imageAssetKey' || key === 'imagemapImageAssetKey') && typeof item === 'string' && item.trim()) {
      keys.add(item.trim());
      continue;
    }

    collectImageAssetKeys(item, keys);
  }
};

const toReferenceRole = (
  templateKey: LineMessageTemplateKey | null,
  editorPayload: unknown | null,
): LineMessageImageAssetReferenceRole => {
  switch (templateKey) {
    case 'flex': {
      const payload = parseEditorPayloadColumn(editorPayload);
      return payload?.flexPreset === 'imageCarousel' ? 'carouselImage' : 'flexImage';
    }
    case 'imagemap':
      return 'imagemap';
    default:
      return 'messageImage';
  }
};

const parseJsonColumn = (value: unknown): unknown | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }

  return value;
};

const parseEditorPayloadColumn = (value: unknown): Record<string, unknown> | null => {
  const parsed = parseJsonColumn(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
};

const normalizeEditorPayloadVersion = (value: unknown): number => {
  const version = Number(value ?? 1);
  return Number.isInteger(version) && version > 0 ? version : 1;
};

const formatReferenceRole = (role: string): string => {
  switch (role) {
    case 'flexImage':
      return 'Flex 圖片';
    case 'carouselImage':
      return '圖片輪播';
    case 'imagemap':
      return 'Imagemap';
    default:
      return '圖片訊息';
  }
};
