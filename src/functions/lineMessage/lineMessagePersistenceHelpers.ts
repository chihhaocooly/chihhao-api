import { AppDataSource } from '@chihhaocooly/chihhao-package';
import {
  LineMessageEntity,
  LineMessageReferenceDto,
  LineMessageTemplateKey,
} from './lineMessageTypes';
import { isLineMessageTemplateKey } from './lineMessageValidator';
import {
  deleteProjectAssetReferencesForEntity,
  replaceProjectAssetReferencesForEntity,
} from '../projectAsset/projectAssetService';
import {
  ProjectAssetReferenceInput,
  ProjectAssetReferenceRole,
  ProjectAssetUsageProfileKey,
} from '../projectAsset/projectAssetTypes';

interface EditorMetadataRow {
  lineMessageKey: string;
  templateKey: string | null;
  editorPayload: unknown | string | null;
  editorPayloadVersion: number | string | null;
}

interface ImageAssetReferenceRow {
  lineMessageKey: string;
  title: string;
  usageRole: string;
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

export const syncLineMessageProjectAssetReferences = async (
  lineMessageKey: string,
  title: string,
  templateKey: LineMessageTemplateKey | null,
  editorPayload: unknown | null,
) => {
  const references = extractProjectAssetReferences(lineMessageKey, title, templateKey, editorPayload);
  try {
    await replaceProjectAssetReferencesForEntity('lineMessage', lineMessageKey, references);
  } catch {
    // Saving the message must not fail before the project asset migration is applied.
  }
};

export const deleteLineMessageProjectAssetReferences = async (lineMessageKey: string) => {
  try {
    await deleteProjectAssetReferencesForEntity('lineMessage', lineMessageKey);
  } catch {
    // Deleting the message should still work in tests or environments before migration.
  }
};

export const readLineMessageImageAssetReferences = async (imageAssetKey: string): Promise<LineMessageReferenceDto[]> => {
  try {
    const rows = await AppDataSource.query(
      `SELECT ref.entityKey AS lineMessageKey, ref.usageRole, ref.entityLabel AS title
       FROM project_asset_reference ref
       WHERE ref.assetKey = ?
        AND ref.entityType = 'lineMessage'
       ORDER BY ref.createdAt DESC`,
      [imageAssetKey]
    ) as ImageAssetReferenceRow[];

    return rows.map((row) => ({
      type: 'imageAsset',
      label: `訊息管理：${row.title}（${formatReferenceRole(row.usageRole)}）`,
      lineMessageKey: row.lineMessageKey,
    }));
  } catch {
    return [];
  }
};

const extractProjectAssetReferences = (
  lineMessageKey: string,
  title: string,
  templateKey: LineMessageTemplateKey | null,
  editorPayload: unknown | null,
): ProjectAssetReferenceInput[] => {
  const assetKeys = new Set<string>();
  collectProjectAssetKeys(editorPayload, assetKeys);
  const referenceRole = toReferenceRole(templateKey, editorPayload);
  const usageProfileKey = toUsageProfileKey(referenceRole);

  return Array.from(assetKeys).map((assetKey) => ({
    assetKey,
    ownerModule: 'messageManagement',
    entityType: 'lineMessage',
    entityKey: lineMessageKey,
    entityLabel: title,
    usageProfileKey,
    usageRole: referenceRole,
    usagePath: '$.editorPayload',
    isBlockingDelete: true,
  }));
};

const collectProjectAssetKeys = (value: unknown, keys: Set<string>) => {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectProjectAssetKeys(item, keys);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if (key === 'assetKey' && typeof item === 'string' && item.trim()) {
      keys.add(item.trim());
      continue;
    }

    collectProjectAssetKeys(item, keys);
  }
};

const toReferenceRole = (
  templateKey: LineMessageTemplateKey | null,
  editorPayload: unknown | null,
): ProjectAssetReferenceRole => {
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

const toUsageProfileKey = (role: ProjectAssetReferenceRole): ProjectAssetUsageProfileKey => {
  switch (role) {
    case 'flexImage':
      return 'messageManagement.flexCardHero';
    case 'carouselImage':
      return 'messageManagement.imageCarousel';
    case 'imagemap':
      return 'messageManagement.imagemap';
    default:
      return 'messageManagement.image';
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
