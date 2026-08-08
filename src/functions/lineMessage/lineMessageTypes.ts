import { LineMessage } from '@chihhaocooly/chihhao-package';

export const LINE_MESSAGE_TYPES = ['text', 'image', 'flex', 'json'] as const;

export type LineMessageType = typeof LINE_MESSAGE_TYPES[number];

export interface LineMessageDto {
  lineMessageKey: string;
  title: string;
  type: LineMessageType;
  keyWords: string[];
  customPayload: unknown;
  summary: string;
  isSendable: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ListLineMessagesOptions {
  q?: string;
  type?: LineMessageType;
  page: number;
  pageSize: number;
}

export interface ListLineMessagesResult {
  items: LineMessageDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SaveLineMessageRequest {
  title?: unknown;
  type?: unknown;
  keyWords?: unknown;
  customPayload?: unknown;
}

export interface LineMessageFieldError {
  field: 'title' | 'type' | 'keyWords' | 'customPayload' | 'imageUrl' | 'json';
  message: string;
}

export interface ValidateLineMessageResult {
  isValid: boolean;
  isSendable: boolean;
  summary: string;
  normalized?: {
    title: string;
    type: LineMessageType;
    keyWords: string[];
    customPayload: Record<string, unknown>;
  };
  fieldErrors: LineMessageFieldError[];
}

export interface LineMessageReferenceDto {
  type: 'welcome' | 'defaultReply' | 'keyword' | 'imageAsset' | 'future';
  label: string;
  lineMessageKey: string;
}

export interface ReplySettingsDto {
  welcomeLineMessageKey: string | null;
  defaultReplyLineMessageKeys: string[];
}

export type LineMessageEntity = LineMessage & {
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};
