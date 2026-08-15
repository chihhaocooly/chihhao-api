import { LineMessage, LineMessageRepository } from '@chihhaocooly/chihhao-package';
import {
  LineMessageEntity,
  LineMessageReferenceDto,
  ListLineMessagesOptions,
  ListLineMessagesResult,
  ReplySettingsDto,
  SaveLineMessageRequest,
  ValidateLineMessageResult,
} from './lineMessageTypes';
import { toLineMessageDto } from './lineMessageMapper';
import {
  deleteLineMessageImageAssetReferences,
  hydrateLineMessageEditorMetadata,
  syncLineMessageImageAssetReferences,
  updateLineMessageEditorMetadata,
} from './lineMessagePersistenceHelpers';
import { isLineMessageTemplateKey, normalizeKeywords, validateLineMessagePayload } from './lineMessageValidator';
import { getReplySettings, saveReplySettings } from './lineMessageSettingsStore';

const defaultPage = 1;
const defaultPageSize = 20;
const maxDefaultReplies = 5;

export const listLineMessages = async (options: Partial<ListLineMessagesOptions>): Promise<ListLineMessagesResult> => {
  const repository = new LineMessageRepository();
  const page = Math.max(Number(options.page ?? defaultPage) || defaultPage, 1);
  const pageSize = Math.min(Math.max(Number(options.pageSize ?? defaultPageSize) || defaultPageSize, 1), 100);
  const search = options.q?.trim().toLowerCase();
  const allMessages = await hydrateLineMessageEditorMetadata(await repository.findAll() as LineMessageEntity[]);

  const filteredMessages = allMessages
    .filter((message) => {
      if (options.type && message.type !== options.type) {
        return false;
      }

      if (!search) {
        return true;
      }

      return message.title.toLowerCase().includes(search)
        || normalizeKeywords(message.keyWords).join(' ').toLowerCase().includes(search)
        || JSON.stringify(message.customPayload).toLowerCase().includes(search)
        || JSON.stringify(message.editorPayload ?? {}).toLowerCase().includes(search)
        || (message.templateKey?.toLowerCase().includes(search) ?? false);
    })
    .sort((left, right) => dateValue(right.updatedAt) - dateValue(left.updatedAt));

  const start = (page - 1) * pageSize;

  return {
    items: filteredMessages.slice(start, start + pageSize).map(toLineMessageDto),
    total: filteredMessages.length,
    page,
    pageSize,
  };
};

export const getLineMessageByKey = async (lineMessageKey: string) => {
  const repository = new LineMessageRepository();
  const message = await repository.findByLineMessageKey(lineMessageKey);
  if (!message) {
    return null;
  }

  const [hydratedMessage] = await hydrateLineMessageEditorMetadata([message as LineMessageEntity]);
  return toLineMessageDto(hydratedMessage);
};

export const validateLineMessage = async (
  payload: SaveLineMessageRequest,
  excludingLineMessageKey?: string,
): Promise<ValidateLineMessageResult> => {
  const result = await validateLineMessagePayload(payload);

  if (result.normalized) {
    const conflict = await findKeywordConflict(result.normalized.keyWords, excludingLineMessageKey);
    if (conflict) {
      result.fieldErrors.push({
        field: 'keyWords',
        message: `關鍵字「${conflict.keyword}」已被「${conflict.title}」使用`,
      });
      result.isValid = false;
      result.isSendable = false;
    }
  }

  return result;
};

export const createLineMessage = async (payload: SaveLineMessageRequest) => {
  const result = await validateLineMessage(payload);
  if (!result.normalized) {
    return { result, item: null };
  }

  const repository = new LineMessageRepository();
  const message = new LineMessage();
  const editableMessage = message as LineMessageEntity;
  editableMessage.title = result.normalized.title;
  editableMessage.type = result.normalized.type;
  editableMessage.keyWords = result.normalized.keyWords;
  editableMessage.customPayload = result.normalized.customPayload;
  editableMessage.templateKey = result.normalized.templateKey;
  editableMessage.editorPayload = result.normalized.editorPayload;
  editableMessage.editorPayloadVersion = result.normalized.editorPayloadVersion;
  editableMessage.createdAt = new Date();
  editableMessage.updatedAt = new Date();

  const savedMessage = await repository.create(message);
  await updateLineMessageEditorMetadata(
    savedMessage.lineMessageKey,
    result.normalized.templateKey,
    result.normalized.editorPayload,
    result.normalized.editorPayloadVersion
  );
  await syncLineMessageImageAssetReferences(
    savedMessage.lineMessageKey,
    result.normalized.templateKey,
    result.normalized.editorPayload
  );
  const [hydratedMessage] = await hydrateLineMessageEditorMetadata([savedMessage as LineMessageEntity]);

  return {
    result,
    item: toLineMessageDto(hydratedMessage),
  };
};

export const updateLineMessage = async (lineMessageKey: string, payload: SaveLineMessageRequest) => {
  const repository = new LineMessageRepository();
  const message = await repository.findByLineMessageKey(lineMessageKey);
  if (!message) {
    return { result: null, item: null };
  }

  const result = await validateLineMessage(payload, lineMessageKey);
  if (!result.normalized) {
    return { result, item: null };
  }

  const editableMessage = message as LineMessageEntity;
  editableMessage.title = result.normalized.title;
  editableMessage.type = result.normalized.type;
  editableMessage.keyWords = result.normalized.keyWords;
  editableMessage.customPayload = result.normalized.customPayload;
  editableMessage.templateKey = result.normalized.templateKey;
  editableMessage.editorPayload = result.normalized.editorPayload;
  editableMessage.editorPayloadVersion = result.normalized.editorPayloadVersion;
  editableMessage.updatedAt = new Date();

  const savedMessage = await repository.update(message);
  await updateLineMessageEditorMetadata(
    savedMessage.lineMessageKey,
    result.normalized.templateKey,
    result.normalized.editorPayload,
    result.normalized.editorPayloadVersion
  );
  await syncLineMessageImageAssetReferences(
    savedMessage.lineMessageKey,
    result.normalized.templateKey,
    result.normalized.editorPayload
  );
  const [hydratedMessage] = await hydrateLineMessageEditorMetadata([savedMessage as LineMessageEntity]);

  return {
    result,
    item: toLineMessageDto(hydratedMessage),
  };
};

export const copyLineMessage = async (lineMessageKey: string) => {
  const repository = new LineMessageRepository();
  const sourceMessage = await repository.findByLineMessageKey(lineMessageKey);
  const source = sourceMessage
    ? (await hydrateLineMessageEditorMetadata([sourceMessage as LineMessageEntity]))[0]
    : null;
  if (!source) {
    return null;
  }

  const sourceTemplateKey = typeof source.templateKey === 'string' && isLineMessageTemplateKey(source.templateKey)
    ? source.templateKey
    : null;
  const message = new LineMessage();
  const editableMessage = message as LineMessageEntity;
  editableMessage.title = `${source.title} 複本`.slice(0, 50);
  editableMessage.type = source.type;
  editableMessage.keyWords = [];
  editableMessage.customPayload = source.customPayload;
  editableMessage.templateKey = sourceTemplateKey;
  editableMessage.editorPayload = source.editorPayload ?? null;
  editableMessage.editorPayloadVersion = Number(source.editorPayloadVersion ?? 1) || 1;
  editableMessage.createdAt = new Date();
  editableMessage.updatedAt = new Date();

  const savedMessage = await repository.create(message);
  await updateLineMessageEditorMetadata(
    savedMessage.lineMessageKey,
    sourceTemplateKey,
    source.editorPayload ?? null,
    Number(source.editorPayloadVersion ?? 1) || 1
  );
  await syncLineMessageImageAssetReferences(
    savedMessage.lineMessageKey,
    sourceTemplateKey,
    source.editorPayload ?? null
  );
  const [hydratedMessage] = await hydrateLineMessageEditorMetadata([savedMessage as LineMessageEntity]);

  return toLineMessageDto(hydratedMessage);
};

export const deleteLineMessage = async (lineMessageKey: string) => {
  const repository = new LineMessageRepository();
  const message = await repository.findByLineMessageKey(lineMessageKey);
  if (!message) {
    return { deleted: false, missing: true, references: [] };
  }

  const references = await getLineMessageReferences(lineMessageKey);
  if (references.length > 0) {
    return { deleted: false, missing: false, references };
  }

  await deleteLineMessageImageAssetReferences(lineMessageKey);
  await repository.delete(message);
  return { deleted: true, missing: false, references };
};

export const getLineMessageReferences = async (lineMessageKey: string): Promise<LineMessageReferenceDto[]> => {
  const settings = await getReplySettings();
  const references: LineMessageReferenceDto[] = [];

  if (settings.welcomeLineMessageKey === lineMessageKey) {
    references.push({ type: 'welcome', label: '歡迎訊息', lineMessageKey });
  }

  if (settings.defaultReplyLineMessageKeys.includes(lineMessageKey)) {
    references.push({ type: 'defaultReply', label: '預設回覆', lineMessageKey });
  }

  return references;
};

export const readReplySettings = async () => {
  return await getReplySettings();
};

export const updateReplySettings = async (payload: Partial<ReplySettingsDto>) => {
  const welcomeLineMessageKey = typeof payload.welcomeLineMessageKey === 'string' && payload.welcomeLineMessageKey.trim()
    ? payload.welcomeLineMessageKey.trim()
    : null;
  const defaultReplyLineMessageKeys = normalizeKeywords(payload.defaultReplyLineMessageKeys);

  if (defaultReplyLineMessageKeys.length > maxDefaultReplies) {
    return {
      settings: null,
      fieldErrors: [{ field: 'defaultReplyLineMessageKeys', message: `預設回覆最多 ${maxDefaultReplies} 則` }],
    };
  }

  const allMessageKeys = new Set((await new LineMessageRepository().findAll()).map((message) => message.lineMessageKey));
  const selectedKeys = [welcomeLineMessageKey, ...defaultReplyLineMessageKeys].filter((key): key is string => !!key);
  const missingKey = selectedKeys.find((key) => !allMessageKeys.has(key));

  if (missingKey) {
    return {
      settings: null,
      fieldErrors: [{ field: 'lineMessageKey', message: `訊息素材不存在或不可用：${missingKey}` }],
    };
  }

  return {
    settings: await saveReplySettings({ welcomeLineMessageKey, defaultReplyLineMessageKeys }),
    fieldErrors: [],
  };
};

const findKeywordConflict = async (keywords: string[], excludingLineMessageKey?: string) => {
  const allMessages = await new LineMessageRepository().findAll();

  for (const keyword of keywords) {
    const owner = allMessages.find((message) => {
      if (excludingLineMessageKey && message.lineMessageKey === excludingLineMessageKey) {
        return false;
      }

      return normalizeKeywords(message.keyWords).includes(keyword);
    });

    if (owner) {
      return { keyword, title: owner.title };
    }
  }

  return null;
};

const dateValue = (value: Date | string | null | undefined): number => {
  if (!value) {
    return 0;
  }

  return new Date(value).getTime();
};
