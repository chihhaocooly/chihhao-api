import axios from 'axios';
import {
  LINE_MESSAGE_TEMPLATE_KEYS,
  LINE_MESSAGE_TYPES,
  LineMessageFieldError,
  LineMessageTemplateKey,
  LineMessageType,
  SaveLineMessageRequest,
  ValidateLineMessageResult,
} from './lineMessageTypes';

const titleMaxLength = 50;
const imageUrlFields = ['originalContentUrl', 'previewImageUrl', 'imageUrl', 'url'];

export const normalizeKeywords = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(
    value
      .map((item) => typeof item === 'string' ? item.trim() : '')
      .filter((item) => item.length > 0)
  ));
};

export const validateLineMessagePayload = async (payload: SaveLineMessageRequest): Promise<ValidateLineMessageResult> => {
  const fieldErrors: LineMessageFieldError[] = [];
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const type = typeof payload.type === 'string' ? payload.type : '';
  const templateKey = normalizeTemplateKey(payload.templateKey);
  const keyWords = normalizeKeywords(payload.keyWords);
  const customPayload = normalizePayload(payload.customPayload);
  const editorPayloadResult = normalizeEditorPayload(payload.editorPayload);
  const editorPayloadVersion = normalizeEditorPayloadVersion(payload.editorPayloadVersion);

  if (!title) {
    fieldErrors.push({ field: 'title', message: '標題為必填' });
  } else if (title.length > titleMaxLength) {
    fieldErrors.push({ field: 'title', message: `標題不可超過 ${titleMaxLength} 字` });
  }

  if (!isLineMessageType(type)) {
    fieldErrors.push({ field: 'type', message: '訊息類型不支援' });
  }

  if (payload.templateKey !== undefined && payload.templateKey !== null && !templateKey) {
    fieldErrors.push({ field: 'templateKey', message: '訊息樣板不支援' });
  }

  if (!customPayload) {
    fieldErrors.push({ field: 'customPayload', message: '訊息內容為必填' });
  }

  if (!editorPayloadResult.isValid) {
    fieldErrors.push({ field: 'editorPayload', message: '友善編輯器內容格式不正確' });
  }

  if (editorPayloadVersion < 1) {
    fieldErrors.push({ field: 'editorPayload', message: '友善編輯器版本格式不正確' });
  }

  const contentResult = customPayload && isLineMessageType(type)
    ? await validateContent(type, customPayload)
    : { isSendable: false, summary: '', errors: [] };

  fieldErrors.push(...contentResult.errors);

  return {
    isValid: fieldErrors.length === 0,
    isSendable: fieldErrors.length === 0 && contentResult.isSendable,
    summary: contentResult.summary,
    normalized: fieldErrors.length === 0 && customPayload && isLineMessageType(type)
      ? {
        title,
        type,
        templateKey,
        keyWords,
        customPayload,
        editorPayload: editorPayloadResult.value,
        editorPayloadVersion,
      }
      : undefined,
    fieldErrors,
  };
};

export const isLineMessageType = (value: string): value is LineMessageType => {
  return LINE_MESSAGE_TYPES.includes(value as LineMessageType);
};

export const isLineMessageTemplateKey = (value: string): value is LineMessageTemplateKey => {
  return LINE_MESSAGE_TEMPLATE_KEYS.includes(value as LineMessageTemplateKey);
};

const normalizeTemplateKey = (value: unknown): LineMessageTemplateKey | null => {
  return typeof value === 'string' && isLineMessageTemplateKey(value) ? value : null;
};

const normalizePayload = (payload: unknown): Record<string, unknown> | null => {
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isRecord(payload) ? payload : null;
};

const normalizeEditorPayload = (payload: unknown): { isValid: boolean; value: Record<string, unknown> | null } => {
  if (payload === undefined || payload === null || payload === '') {
    return { isValid: true, value: null };
  }

  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload) as unknown;
      return isRecord(parsed)
        ? { isValid: true, value: parsed }
        : { isValid: false, value: null };
    } catch {
      return { isValid: false, value: null };
    }
  }

  return isRecord(payload)
    ? { isValid: true, value: payload }
    : { isValid: false, value: null };
};

const normalizeEditorPayloadVersion = (value: unknown): number => {
  if (value === undefined || value === null || value === '') {
    return 1;
  }

  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : 0;
};

const validateContent = async (type: LineMessageType, payload: Record<string, unknown>) => {
  switch (type) {
    case 'text':
      return validateTextPayload(payload);
    case 'image':
      return await validateImagePayload(payload);
    case 'flex':
      return validateFlexPayload(payload);
    case 'template':
      return validateTemplatePayload(payload);
    case 'imagemap':
      return validateImagemapPayload(payload);
    case 'json':
      return validateJsonPayload(payload);
  }
};

const validateTextPayload = (payload: Record<string, unknown>) => {
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  const errors: LineMessageFieldError[] = [];

  if (!text) {
    errors.push({ field: 'customPayload', message: '文字訊息內容不可空白' });
  }

  return {
    isSendable: errors.length === 0,
    summary: text.slice(0, 80),
    errors,
  };
};

const validateImagePayload = async (payload: Record<string, unknown>) => {
  const url = readFirstString(payload, imageUrlFields);
  const errors: LineMessageFieldError[] = [];

  if (!url || !isHttpUrl(url)) {
    errors.push({ field: 'imageUrl', message: '圖片來源必須是有效的 http(s) URL' });
  } else {
    const canReadImage = await checkImageReadable(url);
    if (!canReadImage) {
      errors.push({ field: 'imageUrl', message: '圖片來源無法讀取或格式不支援' });
    }
  }

  return {
    isSendable: errors.length === 0,
    summary: url ?? '',
    errors,
  };
};

const validateFlexPayload = (payload: Record<string, unknown>) => {
  const errors: LineMessageFieldError[] = [];
  const altText = typeof payload.altText === 'string' ? payload.altText.trim() : '';

  if (!altText) {
    errors.push({ field: 'customPayload', message: 'Flex 訊息必須包含 altText' });
  }

  if (!isRecord(payload.contents)) {
    errors.push({ field: 'customPayload', message: 'Flex 訊息必須包含 contents' });
  }

  return {
    isSendable: errors.length === 0,
    summary: altText || JSON.stringify(payload).slice(0, 80),
    errors,
  };
};

const validateTemplatePayload = (payload: Record<string, unknown>) => {
  const errors: LineMessageFieldError[] = [];
  const altText = typeof payload.altText === 'string' ? payload.altText.trim() : '';

  if (payload.type !== 'template') {
    errors.push({ field: 'customPayload', message: 'Template 訊息 type 必須為 template' });
  }

  if (!altText) {
    errors.push({ field: 'customPayload', message: 'Template 訊息必須包含 altText' });
  }

  if (!isRecord(payload.template)) {
    errors.push({ field: 'customPayload', message: 'Template 訊息必須包含 template' });
  }

  return {
    isSendable: errors.length === 0,
    summary: altText || JSON.stringify(payload).slice(0, 80),
    errors,
  };
};

const validateImagemapPayload = (payload: Record<string, unknown>) => {
  const errors: LineMessageFieldError[] = [];
  const baseUrl = typeof payload.baseUrl === 'string' ? payload.baseUrl.trim() : '';
  const altText = typeof payload.altText === 'string' ? payload.altText.trim() : '';
  const baseSize = isRecord(payload.baseSize) ? payload.baseSize : null;
  const actions = Array.isArray(payload.actions) ? payload.actions : null;

  if (payload.type !== 'imagemap') {
    errors.push({ field: 'customPayload', message: 'Imagemap 訊息 type 必須為 imagemap' });
  }

  if (!baseUrl || !isHttpUrl(baseUrl)) {
    errors.push({ field: 'baseUrl', message: 'Imagemap baseUrl 必須是有效的 http(s) URL' });
  }

  if (!altText) {
    errors.push({ field: 'customPayload', message: 'Imagemap 訊息必須包含 altText' });
  }

  if (!baseSize || Number(baseSize.width) !== 1040 || !isPositiveNumber(baseSize.height)) {
    errors.push({ field: 'customPayload', message: 'Imagemap baseSize 必須包含 width=1040 與有效 height' });
  }

  if (!actions || actions.length === 0 || actions.length > 50) {
    errors.push({ field: 'customPayload', message: 'Imagemap actions 必須介於 1 到 50 個' });
  } else {
    for (const action of actions) {
      if (!isValidImagemapAction(action)) {
        errors.push({ field: 'customPayload', message: 'Imagemap action 格式不正確' });
        break;
      }
    }
  }

  return {
    isSendable: errors.length === 0,
    summary: altText || baseUrl || JSON.stringify(payload).slice(0, 80),
    errors,
  };
};

const validateJsonPayload = (payload: Record<string, unknown>) => {
  const errors: LineMessageFieldError[] = [];

  if (typeof payload.type !== 'string' || !payload.type.trim()) {
    errors.push({ field: 'json', message: '自訂 JSON 必須包含 LINE message type' });
  }

  return {
    isSendable: errors.length === 0,
    summary: readSummary(payload),
    errors,
  };
};

const checkImageReadable = async (url: string): Promise<boolean> => {
  try {
    const response = await axios.head(url, { timeout: 3000 });
    const contentType = String(response.headers['content-type'] ?? '');
    return response.status >= 200 && response.status < 400 && contentType.startsWith('image/');
  } catch {
    return false;
  }
};

export const summarizeLineMessagePayload = (type: string, payload: unknown): string => {
  const normalizedPayload = normalizePayload(payload);
  if (!normalizedPayload) {
    return '';
  }

  if (type === 'text') {
    return typeof normalizedPayload.text === 'string' ? normalizedPayload.text.slice(0, 80) : '';
  }

  if (type === 'image') {
    return readFirstString(normalizedPayload, imageUrlFields) ?? '';
  }

  if (type === 'flex') {
    return typeof normalizedPayload.altText === 'string'
      ? normalizedPayload.altText
      : JSON.stringify(normalizedPayload).slice(0, 80);
  }

  if (type === 'template' || type === 'imagemap') {
    return readSummary(normalizedPayload);
  }

  return readSummary(normalizedPayload);
};

const readSummary = (payload: Record<string, unknown>): string => {
  if (typeof payload.altText === 'string') {
    return payload.altText;
  }

  if (typeof payload.text === 'string') {
    return payload.text.slice(0, 80);
  }

  return JSON.stringify(payload).slice(0, 80);
};

const readFirstString = (payload: Record<string, unknown>, fields: string[]): string | null => {
  for (const field of fields) {
    if (typeof payload[field] === 'string' && payload[field].trim()) {
      return payload[field].trim();
    }
  }

  return null;
};

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const isPositiveNumber = (value: unknown): boolean => {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
};

const isValidImagemapAction = (value: unknown): boolean => {
  if (!isRecord(value) || !isRecord(value.area)) {
    return false;
  }

  const type = value.type;
  if (type !== 'message' && type !== 'uri' && type !== 'clipboard') {
    return false;
  }

  const area = value.area;
  const hasValidArea = isNonNegativeNumber(area.x)
    && isNonNegativeNumber(area.y)
    && isPositiveNumber(area.width)
    && isPositiveNumber(area.height);

  if (!hasValidArea) {
    return false;
  }

  if (type === 'message') {
    return typeof value.text === 'string' && value.text.trim().length > 0;
  }

  if (type === 'uri') {
    return typeof value.linkUri === 'string' && isHttpUrl(value.linkUri);
  }

  return typeof value.clipboardText === 'string' && value.clipboardText.trim().length > 0;
};

const isNonNegativeNumber = (value: unknown): boolean => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};
