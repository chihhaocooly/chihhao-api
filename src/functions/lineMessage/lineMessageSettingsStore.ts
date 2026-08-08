import { AppDataSource } from '@chihhaocooly/chihhao-package';
import { v4 as uuidv4 } from 'uuid';
import { ReplySettingsDto } from './lineMessageTypes';

interface RawReplySetting {
  settingKey: string;
  welcomeLineMessageKey: string | null;
  defaultReplyLineMessageKeys: string | string[] | null;
}

export const getReplySettings = async (): Promise<ReplySettingsDto> => {
  const rows = await AppDataSource.query(`
    SELECT settingKey, welcomeLineMessageKey, defaultReplyLineMessageKeys
    FROM line_message_reply_setting
    ORDER BY updatedAt DESC, createdAt DESC
    LIMIT 1
  `) as RawReplySetting[];

  const current = rows[0];
  if (!current) {
    return {
      welcomeLineMessageKey: null,
      defaultReplyLineMessageKeys: [],
    };
  }

  return {
    welcomeLineMessageKey: current.welcomeLineMessageKey,
    defaultReplyLineMessageKeys: parseJsonArray(current.defaultReplyLineMessageKeys),
  };
};

export const saveReplySettings = async (settings: ReplySettingsDto): Promise<ReplySettingsDto> => {
  const rows = await AppDataSource.query(`
    SELECT settingKey
    FROM line_message_reply_setting
    ORDER BY updatedAt DESC, createdAt DESC
    LIMIT 1
  `) as Pick<RawReplySetting, 'settingKey'>[];
  const settingKey = rows[0]?.settingKey ?? uuidv4();
  const defaultReplyLineMessageKeys = JSON.stringify(settings.defaultReplyLineMessageKeys);

  if (rows[0]) {
    await AppDataSource.query(`
      UPDATE line_message_reply_setting
      SET welcomeLineMessageKey = ?, defaultReplyLineMessageKeys = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE settingKey = ?
    `, [settings.welcomeLineMessageKey, defaultReplyLineMessageKeys, settingKey]);
  } else {
    await AppDataSource.query(`
      INSERT INTO line_message_reply_setting
        (settingKey, welcomeLineMessageKey, defaultReplyLineMessageKeys)
      VALUES (?, ?, ?)
    `, [settingKey, settings.welcomeLineMessageKey, defaultReplyLineMessageKeys]);
  }

  return settings;
};

const parseJsonArray = (value: string | string[] | null): string[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
};
