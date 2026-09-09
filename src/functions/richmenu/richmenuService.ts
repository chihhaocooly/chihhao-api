import { memberTransaction } from '../membership/memberTransaction';
import { AppDataSource, MemberConfigurationRepository } from '@chihhaocooly/chihhao-package';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { MyError } from '../../@types/my-error';
import { LineMessageApiService } from '../lineMessageApi/lineMessageApiService';
import {
  deleteProjectAssetReferencesForEntity,
  readProjectAsset,
  replaceProjectAssetReferencesForEntity,
  uploadProjectAsset,
} from '../projectAsset/projectAssetService';
import { ProjectAssetDto } from '../projectAsset/projectAssetTypes';
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

interface LineRichmenuArea {
  bounds?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  action?: {
    type?: string;
    text?: string;
    uri?: string;
    label?: string;
  };
}

interface LineRichmenu {
  richMenuId: string;
  size: {
    width: number;
    height: number;
  };
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: LineRichmenuArea[];
}

export const listRichmenus = async (status?: RichmenuStatus) => {
  const params: unknown[] = [];
  const publishedCondition = "status = 'published' AND COALESCE(lineRchmenuId, '') <> ''";
  const where =
    status === 'published'
      ? `WHERE ${publishedCondition}`
      : status === 'draft'
      ? `WHERE NOT (${publishedCondition})`
      : '';

  const rows = (await AppDataSource.query(
    `SELECT * FROM richmenu ${where} ORDER BY updatedAt DESC, createdAt DESC`,
    params
  )) as RichmenuRow[];

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
  const lineId = normalized.status === 'published' ? await publishLineImage(preparedMenu(richmenuKey, normalized)) : '';

  try {
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
        lineId,
        false,
        normalized.imageUrl,
        normalized.assetKey,
        normalized.startDateTime ? new Date(normalized.startDateTime) : null,
        normalized.endDateTime ? new Date(normalized.endDateTime) : null,
        now,
        now,
      ]
    );
  } catch (error) {
    if (lineId) await cleanupUncommittedMenu(lineId);
    throw error;
  }
  await syncRichmenuAssetReference(richmenuKey, normalized);
  const item = await getRichmenuByKey(richmenuKey);
  return { result, item };
};

export const updateRichmenu = async (richmenuKey: string, payload: SaveRichmenuRequest) => {
  const existing = await readRichmenuRow(richmenuKey);
  if (!existing) {
    throw new MyError(404, '找不到圖文選單');
  }
  // 既有 LINE ID 的內容不能原地更新；包含嘗試將已發布選單退回草稿。
  if (existing.lineRchmenuId) {
    throw new MyError(409, '已發布的圖文選單僅供預覽，請複製後再修改');
  }

  const result = await validateRichmenu(payload, richmenuKey);
  if (!result.isValid) {
    return { result, item: null };
  }

  const normalized = normalizeSavePayload(payload);
  if (toBoolean(existing.isDefault)) throw new MyError(409, '預設選單請複製後再修改');
  if ((await new MemberConfigurationRepository().findRichmenuReferences(richmenuKey)).length)
    throw new MyError(409, '此選單已綁定會員身份，請複製後再修改');
  const lineId = normalized.status === 'published' ? await publishLineImage(preparedMenu(richmenuKey, normalized)) : '';
  try {
    await memberTransaction(async (manager) => {
      await assertMenuUnchanged(manager, existing);
      if ((await new MemberConfigurationRepository(manager).findRichmenuReferences(richmenuKey)).length)
        throw new MyError(409, '此選單已綁定會員身份，請複製後再修改');
      await manager.query(
        `UPDATE richmenu
     SET areas = ?, queryListKeywords = ?, width = ?, height = ?, chatBarText = ?, selected = ?,
       enable = ?, type = ?, status = ?, name = ?, imageUrl = ?, assetKey = ?, startDateTime = ?,
       endDateTime = ?, lineRchmenuId = ?, updatedAt = CURRENT_TIMESTAMP
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
          lineId,
          richmenuKey,
        ]
      );
    });
  } catch (error) {
    if (lineId) await cleanupUncommittedMenu(lineId);
    throw error;
  }

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

  await memberTransaction(async (manager) => {
    if ((await new MemberConfigurationRepository(manager).findRichmenuReferences(richmenuKey)).length)
      throw new MyError(409, '此選單仍被會員身份引用');
    await manager.query('DELETE FROM richmenu WHERE richmenuKey = ?', [richmenuKey]);
  });
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

  const lineRichmenuId = item.lineRchmenuId;
  if (!lineRichmenuId) throw new MyError(409, '請先將選單發布至 LINE');

  await LineMessageApiService.SetDefaultRichmenu(lineRichmenuId);

  await AppDataSource.query('UPDATE richmenu SET isDefault = 0, updatedAt = CURRENT_TIMESTAMP WHERE isDefault = 1');
  await AppDataSource.query(
    'UPDATE richmenu SET isDefault = 1, enable = 1, lineRchmenuId = ?, updatedAt = CURRENT_TIMESTAMP WHERE richmenuKey = ?',
    [lineRichmenuId, richmenuKey]
  );

  return await getRichmenuByKey(richmenuKey);
};

export const syncRichmenusFromLine = async (createdByUserId: string | null) => {
  const lineRichmenus = (await LineMessageApiService.GetRichmenuList()) as LineRichmenu[];
  const defaultLineRichmenuId = await LineMessageApiService.GetDefaultRichmenuId();
  let created = 0;
  let updated = 0;

  if (defaultLineRichmenuId) {
    await AppDataSource.query('UPDATE richmenu SET isDefault = 0 WHERE isDefault = 1');
  }

  for (const lineRichmenu of lineRichmenus) {
    const existing = await readRichmenuByLineId(lineRichmenu.richMenuId);
    const asset = await findOrCreateLineRichmenuAsset(lineRichmenu, existing?.assetKey ?? null, createdByUserId);
    const richmenuKey = existing?.richmenuKey ?? randomUUID();
    const normalized = {
      name: lineRichmenu.name.trim().slice(0, 30) || 'OA 圖文選單',
      chatBarText: lineRichmenu.chatBarText.trim().slice(0, 14) || '選單',
      selected: !!lineRichmenu.selected,
      width: Number(lineRichmenu.size?.width) || asset.width || 0,
      height: Number(lineRichmenu.size?.height) || asset.height || 0,
      imageUrl: asset.publicUrl,
      assetKey: asset.assetKey,
      areas: normalizeLineRichmenuAreas(lineRichmenu.areas ?? []),
      queryListKeywords: [],
      enable: true,
      type: 'general' as RichmenuType,
      status: 'published' as RichmenuStatus,
      startDateTime: null,
      endDateTime: null,
    };
    const isDefault = defaultLineRichmenuId === lineRichmenu.richMenuId;

    if (existing) {
      await AppDataSource.query(
        `UPDATE richmenu
         SET areas = ?, queryListKeywords = ?, width = ?, height = ?, chatBarText = ?, selected = ?,
           enable = 1, type = 'general', status = 'published', name = ?, lineRchmenuId = ?, isDefault = ?,
           imageUrl = ?, assetKey = ?, startDateTime = NULL, endDateTime = NULL, updatedAt = CURRENT_TIMESTAMP
         WHERE richmenuKey = ?`,
        [
          JSON.stringify(normalized.areas),
          JSON.stringify(normalized.queryListKeywords),
          normalized.width,
          normalized.height,
          normalized.chatBarText,
          normalized.selected,
          normalized.name,
          lineRichmenu.richMenuId,
          isDefault,
          normalized.imageUrl,
          normalized.assetKey,
          richmenuKey,
        ]
      );
      updated++;
    } else {
      await AppDataSource.query(
        `INSERT INTO richmenu
          (richmenuKey, areas, queryListKeywords, width, height, chatBarText, selected, enable, type, status,
            name, lineRchmenuId, isDefault, imageUrl, assetKey, startDateTime, endDateTime, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'general', 'published', ?, ?, ?, ?, ?, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          richmenuKey,
          JSON.stringify(normalized.areas),
          JSON.stringify(normalized.queryListKeywords),
          normalized.width,
          normalized.height,
          normalized.chatBarText,
          normalized.selected,
          normalized.name,
          lineRichmenu.richMenuId,
          isDefault,
          normalized.imageUrl,
          normalized.assetKey,
        ]
      );
      created++;
    }

    await syncRichmenuAssetReference(richmenuKey, normalized);
  }

  const result = await listRichmenus();
  return {
    created,
    updated,
    total: lineRichmenus.length,
    items: result.items,
  };
};

export const validateRichmenu = async (
  payload: SaveRichmenuRequest,
  excludingRichmenuKey?: string
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
    } else if (normalized.status === 'published' && (await hasScheduleOverlap(normalized, excludingRichmenuKey))) {
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
  status: normalizeRichmenuStatus(row.status) === 'published' && row.lineRchmenuId ? 'published' : 'draft',
  name: row.name || '',
  lineRchmenuId: row.lineRchmenuId || '',
  isDefault: toBoolean(row.isDefault),
  startDateTime: toIsoString(row.startDateTime),
  endDateTime: toIsoString(row.endDateTime),
  createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
  updatedAt: toIsoString(row.updatedAt) ?? new Date(0).toISOString(),
});

const readRichmenuRow = async (richmenuKey: string): Promise<RichmenuRow | null> => {
  const rows = (await AppDataSource.query('SELECT * FROM richmenu WHERE richmenuKey = ? LIMIT 1', [
    richmenuKey,
  ])) as RichmenuRow[];
  return rows[0] ?? null;
};

const readRichmenuByLineId = async (lineRichmenuId: string): Promise<RichmenuRow | null> => {
  const rows = (await AppDataSource.query('SELECT * FROM richmenu WHERE lineRchmenuId = ? LIMIT 1', [
    lineRichmenuId,
  ])) as RichmenuRow[];
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

const findOrCreateLineRichmenuAsset = async (
  lineRichmenu: LineRichmenu,
  existingAssetKey: string | null,
  createdByUserId: string | null
): Promise<ProjectAssetDto> => {
  if (existingAssetKey) {
    const existingAsset = await readProjectAsset(existingAssetKey);
    if (existingAsset) {
      return existingAsset;
    }
  }

  const syncedAsset = await readSyncedLineRichmenuAsset(lineRichmenu.richMenuId);
  if (syncedAsset) {
    return syncedAsset;
  }

  const imageBuffer = await streamToBuffer(await LineMessageApiService.GetRichmenuImage(lineRichmenu.richMenuId));
  const mimeType = detectImageMimeType(imageBuffer);
  if (!mimeType) {
    throw new MyError(400, `LINE 圖文選單「${lineRichmenu.name}」圖片格式不支援`);
  }

  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  const file = {
    fieldname: 'asset',
    originalname: `line-richmenu-${lineRichmenu.richMenuId}.${extension}`,
    encoding: '7bit',
    mimetype: mimeType,
    size: imageBuffer.byteLength,
    buffer: imageBuffer,
    destination: '',
    filename: '',
    path: '',
    stream: Readable.from(imageBuffer),
  } as Express.Multer.File;

  const uploadResult = await uploadProjectAsset({
    file,
    usageProfileKey: richmenuImageUsageProfileKey,
    displayName: `OA 圖文選單 - ${lineRichmenu.name}`,
    tags: ['OA同步', '圖文選單'],
    createdByUserId,
  });

  if (!uploadResult.item) {
    const message = uploadResult.fieldErrors.map((error) => error.message).join('、') || '圖片匯入素材失敗';
    throw new MyError(400, `LINE 圖文選單「${lineRichmenu.name}」${message}`);
  }

  await AppDataSource.query(
    `UPDATE project_asset
     SET metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.lineRichmenuId', ?),
       updatedAt = CURRENT_TIMESTAMP
     WHERE assetKey = ?`,
    [lineRichmenu.richMenuId, uploadResult.item.assetKey]
  );

  return (await readProjectAsset(uploadResult.item.assetKey)) ?? uploadResult.item;
};

const readSyncedLineRichmenuAsset = async (lineRichmenuId: string): Promise<ProjectAssetDto | null> => {
  const rows = (await AppDataSource.query(
    `SELECT assetKey
     FROM project_asset
     WHERE ownerModule = 'lineRichMenu'
       AND deletedAt IS NULL
       AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.lineRichmenuId')) = ?
     ORDER BY updatedAt DESC
     LIMIT 1`,
    [lineRichmenuId]
  )) as Array<{ assetKey: string }>;

  return rows[0]?.assetKey ? await readProjectAsset(rows[0].assetKey) : null;
};

const normalizeLineRichmenuAreas = (areas: LineRichmenuArea[]): RichmenuArea[] => {
  return areas.map((area) => {
    const action = normalizeLineRichmenuAction(area.action);

    return {
      type: action.type,
      text: action.text,
      uri: action.uri,
      clipboardText: '',
      x: Number(area.bounds?.x) || 0,
      y: Number(area.bounds?.y) || 0,
      width: Number(area.bounds?.width) || 0,
      height: Number(area.bounds?.height) || 0,
      action,
    };
  });
};

const normalizeLineRichmenuAction = (action: LineRichmenuArea['action']): NonNullable<RichmenuArea['action']> => {
  if (action?.type === 'message') {
    return {
      type: 'message',
      text: `${action.text ?? ''}`,
    };
  }

  if (action?.type === 'uri') {
    return {
      type: 'uri',
      uri: `${action.uri ?? ''}`,
      title: `${action.label ?? action.uri ?? '連結'}`,
    };
  }

  return { type: 'none' };
};

const validateArea = (
  area: RichmenuArea,
  index: number,
  fieldErrors: Array<{ field: string; message: string }>
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
  const params: unknown[] = [new Date(payload.endDateTime as string), new Date(payload.startDateTime as string)];
  let excludingClause = '';
  if (excludingRichmenuKey) {
    excludingClause = 'AND richmenuKey <> ?';
    params.push(excludingRichmenuKey);
  }

  const rows = (await AppDataSource.query(
    `SELECT richmenuKey
     FROM richmenu
     WHERE status = 'published' AND COALESCE(lineRchmenuId, '') <> ''
       AND type = 'schedule'
       AND startDateTime < ?
       AND endDateTime > ?
       ${excludingClause}
     LIMIT 1`,
    params
  )) as Array<{ richmenuKey: string }>;

  return rows.length > 0;
};

const normalizeKeywords = (keywords: unknown): string[] => {
  return Array.from(
    new Set(
      (Array.isArray(keywords) ? keywords : [])
        .map((keyword) => `${keyword}`.trim())
        .filter((keyword) => keyword.length > 0)
    )
  );
};

const normalizeRichmenuType = (value: unknown): RichmenuType => (value === 'schedule' ? 'schedule' : 'general');

const normalizeRichmenuStatus = (value: unknown): RichmenuStatus => (value === 'draft' ? 'draft' : 'published');

const readJsonArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
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

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const detectImageMimeType = (buffer: Buffer): 'image/jpeg' | 'image/png' | null => {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  return null;
};

const createLineRichmenuFromLocalItem = async (item: RichmenuDto): Promise<string> => {
  if (!item.assetKey) {
    throw new MyError(400, '請先選擇背景圖片素材');
  }

  const asset = await readProjectAsset(item.assetKey);
  if (!asset) {
    throw new MyError(400, '找不到背景圖片素材');
  }

  const lineSize = chooseLineRichmenuSize(item);
  const lineRichmenuId = await LineMessageApiService.CreateRichmenu({
    size: lineSize,
    selected: item.selected,
    name: item.name.slice(0, 300),
    chatBarText: item.chatBarText.slice(0, 14),
    // 無動作區塊只保留在編輯器；LINE 的熱區清單僅包含可點擊動作，純提示圖片可使用空清單。
    areas: item.areas
      .map((area, index) => ({ area, index }))
      .filter(({ area }) => normalizeAreaAction(area).type !== 'none')
      .slice(0, 20)
      .map(({ area, index }) => toLineRichmenuArea(area, item, lineSize, index)),
  });

  try {
    const image = await buildLineRichmenuImage(asset.publicUrl, lineSize);
    await LineMessageApiService.SetRichmenuImage(lineRichmenuId, image, 'image/jpeg');
    return lineRichmenuId;
  } catch (error) {
    try {
      await LineMessageApiService.DeleteRichmenu(lineRichmenuId);
    } catch (deleteError) {
      console.error('Delete LINE rich menu after image upload failure failed');
    }

    throw error;
  }
};

const chooseLineRichmenuSize = (item: RichmenuDto): { width: number; height: number } => {
  const ratio = item.width > 0 ? item.height / item.width : 1686 / 2500;
  return ratio <= 0.45 ? { width: 2500, height: 843 } : { width: 2500, height: 1686 };
};

const toLineRichmenuArea = (
  area: RichmenuArea,
  item: RichmenuDto,
  lineSize: { width: number; height: number },
  index: number
) => {
  const action = normalizeAreaAction(area);
  const scaleX = lineSize.width / item.width;
  const scaleY = lineSize.height / item.height;
  const x = clampInt(Math.round((Number(area.x) || 0) * scaleX), 0, lineSize.width - 1);
  const y = clampInt(Math.round((Number(area.y) || 0) * scaleY), 0, lineSize.height - 1);
  const width = clampInt(Math.round((Number(area.width) || 0) * scaleX), 1, lineSize.width - x);
  const height = clampInt(Math.round((Number(area.height) || 0) * scaleY), 1, lineSize.height - y);

  if (action.type === 'message') {
    return {
      bounds: { x, y, width, height },
      action: {
        type: 'message' as const,
        text: action.text.slice(0, 300),
      },
    };
  }

  if (action.type === 'uri') {
    return {
      bounds: { x, y, width, height },
      action: {
        type: 'uri' as const,
        uri: action.uri.slice(0, 1000),
        label: (action.title || '連結').slice(0, 20),
      },
    };
  }

  throw new MyError(400, `區塊 ${index + 1} 尚未設定 LINE 支援的動作`);
};

const buildLineRichmenuImage = async (
  publicUrl: string,
  lineSize: { width: number; height: number }
): Promise<Buffer> => {
  const response = await axios.get<ArrayBuffer>(publicUrl, {
    responseType: 'arraybuffer',
    timeout: 10000,
    maxContentLength: 20 * 1024 * 1024,
  });
  const source = Buffer.from(response.data);
  const sharp = await import('sharp');
  let quality = 90;
  let output = await sharp
    .default(source)
    .resize(lineSize.width, lineSize.height, { fit: 'fill' })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  while (output.byteLength > 1024 * 1024 && quality > 50) {
    quality -= 10;
    output = await sharp
      .default(source)
      .resize(lineSize.width, lineSize.height, { fit: 'fill' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  if (output.byteLength > 1024 * 1024) {
    throw new MyError(400, '背景圖片壓縮後仍超過 LINE 圖文選單 1MB 限制');
  }

  return output;
};

const clampInt = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

// 會員同步只取已發布 ID，不能把發布錯誤延遲到會員身份切換時。
export const getPublishedMemberRichmenu = async (richmenuKey: string): Promise<string> => {
  const item = await getRichmenuByKey(richmenuKey);
  if (!item || item.type !== 'general' || item.status !== 'published' || !item.enable || !item.lineRchmenuId)
    throw new MyError(409, '請先將會員圖文選單發布至 LINE 並啟用');
  return item.lineRchmenuId;
};

const preparedMenu = (richmenuKey: string, payload: SaveRichmenuRequest): RichmenuDto => ({
  ...payload,
  richmenuKey,
  lineRchmenuId: '',
  isDefault: false,
  createdAt: '',
  updatedAt: '',
});

const cleanupUncommittedMenu = async (lineId: string): Promise<void> => {
  try {
    await LineMessageApiService.DeleteRichmenu(lineId);
  } catch {
    console.warn('未提交的 LINE 選單清理失敗，需人工檢查');
  }
};

const publishLineImage = async (item: RichmenuDto): Promise<string> => {
  try {
    return await createLineRichmenuFromLocalItem(item);
  } catch (error) {
    if (error instanceof MyError) throw error;
    throw new MyError(502, '發布至 LINE 失敗，請確認 LINE 設定與圖片後重試');
  }
};

const assertMenuUnchanged = async (manager: import('typeorm').EntityManager, expected: RichmenuRow): Promise<void> => {
  const rows = (await manager.query('SELECT * FROM richmenu WHERE richmenuKey = ? FOR UPDATE', [
    expected.richmenuKey,
  ])) as RichmenuRow[];
  if (!rows[0] || JSON.stringify(rows[0]) !== JSON.stringify(expected))
    throw new MyError(409, '選單資料已變更，請重新載入後發布');
};

export const publishRichmenu = async (richmenuKey: string): Promise<RichmenuDto> => {
  const existing = await readRichmenuRow(richmenuKey);
  if (!existing) throw new MyError(404, '找不到圖文選單');
  const item = toRichmenuDto(existing);
  if (item.status === 'published' && item.lineRchmenuId) return item;
  const payload: SaveRichmenuRequest = { ...item, assetKey: item.assetKey ?? '', status: 'published' };
  const validation = await validateRichmenu(payload, richmenuKey);
  if (!validation.isValid) throw new MyError(400, validation.fieldErrors.map((error) => error.message).join('；'));
  const lineId = await publishLineImage(item);
  try {
    await memberTransaction(async (manager) => {
      await assertMenuUnchanged(manager, existing);
      await manager.query(
        "UPDATE richmenu SET status = 'published', lineRchmenuId = ?, updatedAt = CURRENT_TIMESTAMP WHERE richmenuKey = ?",
        [lineId, richmenuKey]
      );
    });
  } catch (error) {
    await cleanupUncommittedMenu(lineId);
    throw error;
  }
  return { ...item, status: 'published', lineRchmenuId: lineId };
};
