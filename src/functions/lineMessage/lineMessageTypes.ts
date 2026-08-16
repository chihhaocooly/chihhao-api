import { LineMessage } from '@chihhaocooly/chihhao-package';

export const LINE_MESSAGE_TYPES = ['text', 'image', 'flex', 'imagemap', 'json'] as const;

export type LineMessageType = typeof LINE_MESSAGE_TYPES[number];

export const LINE_MESSAGE_TEMPLATE_KEYS = [
  'text',
  'image',
  'flex',
  'imagemap',
  'customJson',
] as const;

export type LineMessageTemplateKey = typeof LINE_MESSAGE_TEMPLATE_KEYS[number];

export const LINE_MESSAGE_IMAGE_ASSET_KINDS = ['messageImage', 'imagemap'] as const;

export type LineMessageImageAssetKind = typeof LINE_MESSAGE_IMAGE_ASSET_KINDS[number];

export type LineMessageImageAssetReferenceRole =
  | 'messageImage'
  | 'flexImage'
  | 'carouselImage'
  | 'imagemap';

export interface LineMessageImageVariantDto {
  width: number;
  height: number;
  storageObjectName: string;
  publicUrl: string;
}

export type LineMessageImageVariantsDto = Record<string, LineMessageImageVariantDto>;

export interface LineMessageImageAssetDto {
  imageAssetKey: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  assetKind: LineMessageImageAssetKind;
  storageBucket: string;
  storageObjectName: string;
  publicUrl: string;
  width: number | null;
  height: number | null;
  imagemapBaseUrl: string | null;
  imagemapBaseSizeWidth: number | null;
  imagemapBaseSizeHeight: number | null;
  imageVariants: LineMessageImageVariantsDto | null;
  createdByUserId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

export interface LineMessageDto {
  lineMessageKey: string;
  title: string;
  type: LineMessageType;
  templateKey: LineMessageTemplateKey | null;
  keyWords: string[];
  customPayload: unknown;
  editorPayload: unknown | null;
  editorPayloadVersion: number;
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
  templateKey?: unknown;
  keyWords?: unknown;
  customPayload?: unknown;
  editorPayload?: unknown;
  editorPayloadVersion?: unknown;
}

export interface LineMessageFieldError {
  field:
    | 'title'
    | 'type'
    | 'templateKey'
    | 'keyWords'
    | 'customPayload'
    | 'editorPayload'
    | 'imageUrl'
    | 'json'
    | 'file'
    | 'contentType'
    | 'sizeBytes'
    | 'storageBucket'
    | 'baseUrl'
    | 'assetKind'
    | 'assetKey';
  message: string;
}

export interface ValidateLineMessageResult {
  isValid: boolean;
  isSendable: boolean;
  summary: string;
  normalized?: {
    title: string;
    type: LineMessageType;
    templateKey: LineMessageTemplateKey | null;
    keyWords: string[];
    customPayload: Record<string, unknown>;
    editorPayload: Record<string, unknown> | null;
    editorPayloadVersion: number;
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

export type LineMessageEntity = Omit<LineMessage, 'templateKey'> & {
  templateKey?: LineMessageTemplateKey | null;
  editorPayload?: Record<string, unknown> | null;
  editorPayloadVersion?: number;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};
