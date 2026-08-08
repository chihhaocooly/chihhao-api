import axios from 'axios';
import {
  LINE_MESSAGE_TYPES,
  LineMessageFieldError,
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
  const keyWords = normalizeKeywords(payload.keyWords);
  const customPayload = normalizePayload(payload.customPayload);

  if (!title) {
    fieldErrors.push({ field: 'title', message: '標題為必填' });
  } else if (title.length > titleMaxLength) {
    fieldErrors.push({ field: 'title', message: `標題不可超過 ${titleMaxLength} 字` });
  }

  if (!isLineMessageType(type)) {
    fieldErrors.push({ field: 'type', message: '訊息類型不支援' });
  }

  if (!customPayload) {
    fieldErrors.push({ field: 'customPayload', message: '訊息內容為必填' });
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
      ? { title, type, keyWords, customPayload }
      : undefined,
    fieldErrors,
  };
};

export const isLineMessageType = (value: string): value is LineMessageType => {
  return LINE_MESSAGE_TYPES.includes(value as LineMessageType);
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

const validateContent = async (type: LineMessageType, payload: Record<string, unknown>) => {
  switch (type) {
    case 'text':
      return validateTextPayload(payload);
    case 'image':
      return await validateImagePayload(payload);
    case 'flex':
      return validateFlexPayload(payload);
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

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};
