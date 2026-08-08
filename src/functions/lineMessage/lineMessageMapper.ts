import { LineMessageDto, LineMessageEntity } from './lineMessageTypes';
import { isLineMessageType, summarizeLineMessagePayload } from './lineMessageValidator';

export const toLineMessageDto = (message: LineMessageEntity): LineMessageDto => {
  const type = isLineMessageType(message.type) ? message.type : 'json';

  return {
    lineMessageKey: message.lineMessageKey,
    title: message.title,
    type,
    keyWords: Array.isArray(message.keyWords) ? message.keyWords : [],
    customPayload: message.customPayload,
    summary: summarizeLineMessagePayload(type, message.customPayload),
    isSendable: true,
    createdAt: toIsoString(message.createdAt),
    updatedAt: toIsoString(message.updatedAt),
  };
};

const toIsoString = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
};
