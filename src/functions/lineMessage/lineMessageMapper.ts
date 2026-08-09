import { LineMessageDto, LineMessageEntity } from './lineMessageTypes';
import { isLineMessageTemplateKey, isLineMessageType, summarizeLineMessagePayload } from './lineMessageValidator';

export const toLineMessageDto = (message: LineMessageEntity): LineMessageDto => {
  const type = isLineMessageType(message.type) ? message.type : 'json';
  const editorPayloadVersion = Number(message.editorPayloadVersion ?? 1);

  return {
    lineMessageKey: message.lineMessageKey,
    title: message.title,
    type,
    templateKey: typeof message.templateKey === 'string' && isLineMessageTemplateKey(message.templateKey)
      ? message.templateKey
      : null,
    keyWords: Array.isArray(message.keyWords) ? message.keyWords : [],
    customPayload: message.customPayload,
    editorPayload: message.editorPayload ?? null,
    editorPayloadVersion: Number.isFinite(editorPayloadVersion) && editorPayloadVersion > 0 ? editorPayloadVersion : 1,
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
