export type RichmenuStatus = 'published' | 'draft';
export type RichmenuType = 'general' | 'schedule';

export interface RichmenuAreaAction {
  type: 'message' | 'uri' | 'none' | string;
  text?: string;
  uri?: string;
  title?: string;
  tags?: string[];
  external?: boolean;
  GoogleAnalytics?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
  };
}

export interface RichmenuArea {
  x: number;
  y: number;
  width: number;
  height: number;
  type?: string;
  text?: string;
  uri?: string;
  action?: RichmenuAreaAction;
  [key: string]: unknown;
}

export interface RichmenuDto {
  richmenuKey: string;
  areas: RichmenuArea[];
  queryListKeywords: string[];
  width: number;
  height: number;
  imageUrl: string;
  assetKey: string | null;
  chatBarText: string;
  selected: boolean;
  enable: boolean;
  type: RichmenuType;
  status: RichmenuStatus;
  name: string;
  lineRchmenuId: string;
  isDefault: boolean;
  startDateTime: string | null;
  endDateTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveRichmenuRequest {
  name: string;
  chatBarText: string;
  selected: boolean;
  width: number;
  height: number;
  imageUrl: string;
  assetKey: string;
  areas: RichmenuArea[];
  queryListKeywords: string[];
  enable: boolean;
  type: RichmenuType;
  status: RichmenuStatus;
  startDateTime: string | null;
  endDateTime: string | null;
}

export interface RichmenuValidationResult {
  isValid: boolean;
  fieldErrors: Array<{ field: string; message: string }>;
}

export interface RichmenuRow {
  richmenuKey: string;
  areas: string | RichmenuArea[] | null;
  queryListKeywords: string | string[] | null;
  width: number;
  height: number;
  imageUrl: string;
  assetKey: string | null;
  chatBarText: string;
  selected: number | boolean;
  enable: number | boolean;
  type: string;
  status: string;
  name: string;
  lineRchmenuId: string;
  isDefault: number | boolean;
  startDateTime: Date | string | null;
  endDateTime: Date | string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}
