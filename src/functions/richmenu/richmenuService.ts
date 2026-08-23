import { AppDataSource } from '@chihhaocooly/chihhao-package';
import { randomUUID } from 'crypto';
import { MyError } from '../../@types/my-error';
import { LineMessageApiService } from '../lineMessageApi/lineMessageApiService';
import {
  deleteProjectAssetReferencesForEntity,
  readProjectAsset,
  replaceProjectAssetReferencesForEntity,
} from '../projectAsset/projectAssetService';
import { evaluateProjectAssetEligibility } from '../projectAsset/projectAssetUsageProfiles';
import {
  RichmenuDto,
  RichmenuRow,
  RichmenuStatus,
  SaveRichmenuRequest,
  RichmenuType,
  RichmenuValidationResult,
  RichmenuArea,
} from './richmenuTypes';

const richmenuEntityType = 'lineRichMenu';
const richmenuImageUsageProfileKey = 'lineRichMenu.richMenuImage';

export const listRichmenus = async (status?: RichmenuStatus) => {
  const params: unknown[] = [];
  const where = status ? 'WHERE status = ?' : '';
  if (status) {
    params.push(status);
  }

  const rows = await AppDataSource.query(
    `SELECT * FROM richmenu ${where} ORDER BY updatedAt DESC, createdAt DESC`,
    params
  ) as RichmenuRow[];

  return {
    items: rows.map(toRichmenuDto),
    total: rows.length,
  };
};

export const getRichmenuByKey = async (richmenuKey: string): Promise<RichmenuDto | null> => {
  const row = await readRichmenuRow(richmenuKey);
  return row ? toRichmenuDto(row) : null;
};

export const createRichmenu = async (payload: SaveRichmenuRequest) => {
  const result = await validateRichmenu(payload);
  if (!result.isValid) {
    return { result, item: null };
  }

  const now = new Date();
  const richmenuKey = randomUUID();
  const normalized = normalizeSavePayload(payload);

  await AppDataSource.query(
    `INSERT INTO richmenu
      (richmenuKey, areas, queryListKeywords, width, height, chatBarText, selected, enable, type, status,
        name, lineRchmenuId, isDefault, imageUrl, assetKey, startDateTime, endDateTime, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      richmenuKey,
      JSON.stringify(normalized.areas),
      JSON.stringify(normalized.queryListKeywords),
      normalized.width,
      normalized.height,
      normalized.chatBarText,
      normalized.selected,
      normalized.enable,
      normalized.type,
      normalized.status,
      normalized.name,
      '',
      false,
      normalized.imageUrl,
      normalized.assetKey,
      normalized.startDateTime ? new Date(normalized.startDateTime) : null,
      normalized.endDateTime ? new Date(normalized.endDateTime) : null,
      now,
      now,
    ]
  );

  await syncRichmenuAssetReference(richmenuKey, normalized);
  const item = await getRichmenuByKey(richmenuKey);
  return { result, item };
};

export const updateRichmenu = async (richmenuKey: string, payload: SaveRichmenuRequest) => {
  const existing = await readRichmenuRow(richmenuKey);
  if (!existing) {
    throw new MyError(404, '找不到圖文選單');
  }

  const result = await validateRichmenu(payload, richmenuKey);
  if (!result.isValid) {
    return { result, item: null };
  }

  const normalized = normalizeSavePayload(payload);
  await AppDataSource.query(
    `UPDATE richmenu
     SET areas = ?, queryListKeywords = ?, width = ?, height = ?, chatBarText = ?, selected = ?,
       enable = ?, type = ?, status = ?, name = ?, imageUrl = ?, assetKey = ?, startDateTime = ?,
       endDateTime = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE richmenuKey = ?`,
    [
      JSON.stringify(normalized.areas),
      JSON.stringify(normalized.queryListKeywords),
      normalized.width,
      normalized.height,
      normalized.chatBarText,
      normalized.selected,
      normalized.enable,
      normalized.type,
      normalized.status,
      normalized.name,
      normalized.imageUrl,
      normalized.assetKey,
      normalized.startDateTime ? new Date(normalized.startDateTime) : null,
      normalized.endDateTime ? new Date(normalized.endDateTime) : null,
      richmenuKey,
    ]
  );

  await syncRichmenuAssetReference(richmenuKey, normalized);
  const item = await getRichmenuByKey(richmenuKey);
  return { result, item };
};

export const copyRichmenu = async (richmenuKey: string) => {
  const source = await readRichmenuRow(richmenuKey);
  if (!source) {
    throw new MyError(404, '找不到圖文選單');
  }

  const sourceDto = toRichmenuDto(source);
  const payload: SaveRichmenuRequest = {
    name: `${sourceDto.name} 複本`.slice(0, 30),
    chatBarText: sourceDto.chatBarText,
    selected: sourceDto.selected,
    width: sourceDto.width,
    height: sourceDto.height,
    imageUrl: sourceDto.imageUrl,
    assetKey: sourceDto.assetKey ?? '',
    areas: sourceDto.areas,
    queryListKeywords: [],
    enable: true,
    type: sourceDto.type,
    status: 'draft',
    startDateTime: sourceDto.startDateTime,
    endDateTime: sourceDto.endDateTime,
  };

  return await createRichmenu(payload);
};

export const deleteRichmenu = async (richmenuKey: string) => {
  const existing = await readRichmenuRow(richmenuKey);
  if (!existing) {
    throw new MyError(404, '找不到圖文選單');
  }

  if (toBoolean(existing.isDefault)) {
    throw new MyError(400, '預設圖文選單不可刪除');
  }

  await AppDataSource.query('DELETE FROM richmenu WHERE richmenuKey = ?', [richmenuKey]);
  await deleteProjectAssetReferencesForEntity(richmenuEntityType, richmenuKey);
};

export const setDefaultRichmenuByKey = async (richmenuKey: string) => {
  const existing = await readRichmenuRow(richmenuKey);
  if (!existing) {
    throw new MyError(404, '找不到圖文選單');
  }

  const item = toRichmenuDto(existing);
  if (item.status !== 'published') {
    throw new MyError(400, '只有已發布圖文選單可設為預設');
  }

  if (item.type !== 'general') {
    throw new MyError(400, '只有永久啟用圖文選單可設為預設');
  }

  await AppDataSource.query('UPDATE richmenu SET isDefault = 0, updatedAt = CURRENT_TIMESTAMP WHERE isDefault = 1');
  await AppDataSource.query('UPDATE richmenu SET isDefault = 1, enable = 1, updatedAt = CURRENT_TIMESTAMP WHERE richmenuKey = ?', [richmenuKey]);

  if (item.lineRchmenuId) {
    await LineMessageApiService.SetDefaultRichmenu(item.lineRchmenuId);
  }

  return await getRichmenuByKey(richmenuKey);
};

export const validateRichmenu = async (
  payload: SaveRichmenuRequest,
  excludingRichmenuKey?: string,
): Promise<RichmenuValidationResult> => {
  const normalized = normalizeSavePayload(payload);
  const fieldErrors: Array<{ field: string; message: string }> = [];

  if (!normalized.name) {
    fieldErrors.push({ field: 'name', message: '請輸入標題' });
  }

  if (normalized.name.length > 30) {
    fieldErrors.push({ field: 'name', message: '標題最多 30 字元' });
  }

  if (!normalized.chatBarText) {
    fieldErrors.push({ field: 'chatBarText', message: '請輸入選單列顯示文字' });
  }

  if (normalized.chatBarText.length > 14) {
    fieldErrors.push({ field: 'chatBarText', message: '選單列顯示文字最多 14 字元' });
  }

  if (!normalized.assetKey) {
    fieldErrors.push({ field: 'assetKey', message: '請選擇背景圖片素材' });
  }

  if (!normalized.imageUrl) {
    fieldErrors.push({ field: 'imageUrl', message: '背景圖片網址不可為空' });
  }

  if (normalized.width <= 0 || normalized.height <= 0) {
    fieldErrors.push({ field: 'imageSize', message: '圖片尺寸不可為空' });
  }

  if (normalized.areas.length === 0) {
    fieldErrors.push({ field: 'areas', message: '至少需要一個熱區' });
  }

  for (const [index, area] of normalized.areas.entries()) {
    validateArea(area, index, fieldErrors);
  }

  if (normalized.type === 'schedule') {
    if (!normalized.startDateTime || !normalized.endDateTime) {
      fieldErrors.push({ field: 'schedule', message: '請設定上架與下架時間' });
    } else if (new Date(normalized.startDateTime) >= new Date(normalized.endDateTime)) {
      fieldErrors.push({ field: 'schedule', message: '下架時間必須晚於上架時間' });
    } else if (normalized.status === 'published' && await hasScheduleOverlap(normalized, excludingRichmenuKey)) {
      fieldErrors.push({ field: 'schedule', message: '排程時間不可與已發布排程選單重疊' });
    }
  }

  if (normalized.assetKey) {
    const asset = await readProjectAsset(normalized.assetKey);
    if (!asset) {
      fieldErrors.push({ field: 'assetKey', message: '找不到背景圖片素材' });
    } else {
      const eligibility = evaluateProjectAssetEligibility(asset, richmenuImageUsageProfileKey);
      if (!eligibility.isEligible) {
        fieldErrors.push(...eligibility.reasons.map((message) => ({ field: 'assetKey', message })));
      }
    }
  }

  return {
    isValid: fieldErrors.length === 0,
    fieldErrors,
  };
};

export const toRichmenuDto = (row: RichmenuRow): RichmenuDto => ({
  richmenuKey: row.richmenuKey,
  areas: readJsonArray<RichmenuArea>(row.areas),
  queryListKeywords: readJsonArray<string>(row.queryListKeywords),
  width: Number(row.width) || 0,
  height: Number(row.height) || 0,
  imageUrl: row.imageUrl || '',
  assetKey: row.assetKey || null,
  chatBarText: row.chatBarText || '',
  selected: toBoolean(row.selected),
  enable: row.enable === undefined ? true : toBoolean(row.enable),
  type: normalizeRichmenuType(row.type),
  status: normalizeRichmenuStatus(row.status),
  name: row.name || '',
  lineRchmenuId: row.lineRchmenuId || '',
  isDefault: toBoolean(row.isDefault),
  startDateTime: toIsoString(row.startDateTime),
  endDateTime: toIsoString(row.endDateTime),
  createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
  updatedAt: toIsoString(row.updatedAt) ?? new Date(0).toISOString(),
});

const readRichmenuRow = async (richmenuKey: string): Promise<RichmenuRow | null> => {
  const rows = await AppDataSource.query('SELECT * FROM richmenu WHERE richmenuKey = ? LIMIT 1', [richmenuKey]) as RichmenuRow[];
  return rows[0] ?? null;
};

const normalizeSavePayload = (payload: SaveRichmenuRequest): SaveRichmenuRequest => ({
  name: `${payload.name ?? ''}`.trim(),
  chatBarText: `${payload.chatBarText ?? ''}`.trim(),
  selected: !!payload.selected,
  width: Number(payload.width) || 0,
  height: Number(payload.height) || 0,
  imageUrl: `${payload.imageUrl ?? ''}`.trim(),
  assetKey: `${payload.assetKey ?? ''}`.trim(),
  areas: Array.isArray(payload.areas) ? payload.areas : [],
  queryListKeywords: normalizeKeywords(payload.queryListKeywords),
  enable: payload.enable !== false,
  type: normalizeRichmenuType(payload.type),
  status: normalizeRichmenuStatus(payload.status),
  startDateTime: payload.type === 'schedule' ? payload.startDateTime : null,
  endDateTime: payload.type === 'schedule' ? payload.endDateTime : null,
});

const syncRichmenuAssetReference = async (richmenuKey: string, payload: SaveRichmenuRequest): Promise<void> => {
  await replaceProjectAssetReferencesForEntity(richmenuEntityType, richmenuKey, [
    {
      assetKey: payload.assetKey,
      ownerModule: 'lineRichMenu',
      entityType: richmenuEntityType,
      entityKey: richmenuKey,
      entityLabel: payload.name,
      usageProfileKey: richmenuImageUsageProfileKey,
      usageRole: 'richMenuImage',
      usagePath: '$.assetKey',
      isBlockingDelete: true,
    },
  ]);
};

const validateArea = (
  area: RichmenuArea,
  index: number,
  fieldErrors: Array<{ field: string; message: string }>,
): void => {
  const prefix = `areas.${index}`;
  const width = Number(area.width) || 0;
  const height = Number(area.height) || 0;

  if (width <= 0 || height <= 0) {
    fieldErrors.push({ field: prefix, message: `區塊 ${index + 1} 尺寸不可為空` });
  }

  const action = normalizeAreaAction(area);
  if (action.type === 'message' && !action.text) {
    fieldErrors.push({ field: prefix, message: `區塊 ${index + 1} 請輸入觸發文字內容` });
  }

  if (action.type === 'message' && action.text.length > 300) {
    fieldErrors.push({ field: prefix, message: `區塊 ${index + 1} 觸發文字內容最多 300 字元` });
  }

  if (action.type === 'uri') {
    if (!isHttpUrl(action.uri || action.text || '')) {
      fieldErrors.push({ field: prefix, message: `區塊 ${index + 1} 請輸入 http 或 https 網址` });
    }

    if (!action.title) {
      fieldErrors.push({ field: prefix, message: `區塊 ${index + 1} 請輸入網址名稱` });
    }
  }
};

const normalizeAreaAction = (area: RichmenuArea): { type: string; text: string; uri: string; title: string } => {
  const source = area.action ?? area;
  return {
    type: `${source.type ?? 'none'}`,
    text: `${source.text ?? ''}`.trim(),
    uri: `${source.uri ?? ''}`.trim(),
    title: `${source.title ?? ''}`.trim(),
  };
};

const hasScheduleOverlap = async (payload: SaveRichmenuRequest, excludingRichmenuKey?: string): Promise<boolean> => {
  const params: unknown[] = [
    new Date(payload.endDateTime as string),
    new Date(payload.startDateTime as string),
  ];
  let excludingClause = '';
  if (excludingRichmenuKey) {
    excludingClause = 'AND richmenuKey <> ?';
    params.push(excludingRichmenuKey);
  }

  const rows = await AppDataSource.query(
    `SELECT richmenuKey
     FROM richmenu
     WHERE status = 'published'
       AND type = 'schedule'
       AND startDateTime < ?
       AND endDateTime > ?
       ${excludingClause}
     LIMIT 1`,
    params
  ) as Array<{ richmenuKey: string }>;

  return rows.length > 0;
};

const normalizeKeywords = (keywords: unknown): string[] => {
  return Array.from(new Set(
    (Array.isArray(keywords) ? keywords : [])
      .map((keyword) => `${keyword}`.trim())
      .filter((keyword) => keyword.length > 0)
  ));
};

const normalizeRichmenuType = (value: unknown): RichmenuType => value === 'schedule' ? 'schedule' : 'general';

const normalizeRichmenuStatus = (value: unknown): RichmenuStatus => value === 'draft' ? 'draft' : 'published';

const readJsonArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
};

const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';

const toIsoString = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};
