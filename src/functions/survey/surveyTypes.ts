import { MemberFieldBinding, MemberFieldDefinition, MemberFieldValueData, MemberMenuSyncStatus } from '@chihhaocooly/chihhao-package';
import { ProjectAssetDto } from '../projectAsset/projectAssetTypes';

export const surveyQuestionTypes = ['text', 'radio', 'checkbox', 'select', 'member-field'] as const;

export type SurveyQuestionType = typeof surveyQuestionTypes[number];

export type SurveyRuntimeState = 'not-started' | 'expired' | 'disabled' | 'submitted';

export interface SurveyQuestionOption {
  title: string;
  value?: string;
  enableText?: boolean;
  group?: string;
  all?: boolean;
}

export interface SurveyQuestion {
  id: string;
  title: string;
  type: SurveyQuestionType;
  required: boolean;
  description?: string;
  placeholder?: string;
  data?: SurveyQuestionOption[];
  memberFieldBinding?: MemberFieldBinding;
  memberField?: MemberFieldDefinition;
}

export interface SurveyRuntimeStatusInfo {
  state: SurveyRuntimeState;
  message: string;
}

export interface SurveyRuntimeDto {
  version: number;
  id: string;
  title: string;
  descriptionText?: string;
  descriptionImage?: string;
  relatedWebsiteUrl?: string;
  privacyPolicy?: string;
  startDate?: string;
  endDate?: string;
  enable: boolean;
  repeatable: boolean;
  showRepeatableRecords: boolean;
  finishText?: string;
  finishSendMessage?: boolean;
  hasSubmitted: boolean;
  canViewReports: boolean;
  statusInfo?: SurveyRuntimeStatusInfo;
  questions: SurveyQuestion[];
}

export interface SurveyAnswerPayload {
  questionId: string;
  type: SurveyQuestionType;
  answer: MemberFieldValueData | null;
  extraText?: Record<string, string>;
}

export interface SurveySubmitRequest {
  requestId: string;
  surveyVersion: number;
  surveyId: string;
  userId: string;
  displayName: string;
  answers: SurveyAnswerPayload[];
}

export interface SurveySubmitResponse {
  membershipOutcome?: 'changed' | 'unchanged' | 'skipped-source' | 'none';
  menuSyncStatus?: MemberMenuSyncStatus | null;
  reportKey: string;
  message?: string;
}

export interface SurveyReportSummaryDto {
  reportKey: string;
  surveyId: string;
  surveyTitle: string;
  submittedAt: string;
}

export interface SurveyReportDetailDto extends SurveyReportSummaryDto {
  displayName: string | null;
  lineUserId: string;
  answers: SurveyReportAnswerDto[];
}

export interface SurveyReportAnswerDto {
  memberField?: MemberFieldDefinition;
  questionId: string;
  questionTitle: string;
  type: SurveyQuestionType;
  answer: MemberFieldValueData | null;
  extraText?: Record<string, string>;
}

export interface SurveyAdminDto {
  version: number;
  surveyKey: string;
  title: string;
  primaryCategoryKey: string | null;
  secondaryCategoryKey: string | null;
  enable: boolean;
  startAt: string | null;
  endAt: string | null;
  repeatable: boolean;
  showRepeatableRecords: boolean;
  descriptionText: string | null;
  descriptionImageAssetKey: string | null;
  descriptionImage: string | null;
  relatedWebsiteUrl: string | null;
  privacyPolicy: string | null;
  finishText: string | null;
  finishSendMessage: boolean;
  questions: SurveyQuestion[];
  settings: Record<string, unknown> | null;
  fillUrl: string | null;
  responseCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

export interface ListSurveysResult {
  items: SurveyAdminDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListSurveyReportsResult {
  items: SurveyReportDetailDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SaveSurveyRequest {
  title?: unknown;
  primaryCategoryKey?: unknown;
  secondaryCategoryKey?: unknown;
  enable?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  repeatable?: unknown;
  showRepeatableRecords?: unknown;
  descriptionText?: unknown;
  descriptionImageAssetKey?: unknown;
  relatedWebsiteUrl?: unknown;
  privacyPolicy?: unknown;
  finishText?: unknown;
  finishSendMessage?: unknown;
  questions?: unknown;
  settings?: unknown;
}

export interface SurveyCategoryDto {
  categoryKey: string;
  name: string;
  sortOrder: number;
  children: SurveySubcategoryDto[];
}

export interface SurveySubcategoryDto {
  categoryKey: string;
  parentCategoryKey: string;
  name: string;
  sortOrder: number;
}

export interface SaveSurveyCategoriesRequest {
  categories?: unknown;
}

export interface SurveyFieldError {
  field: string;
  message: string;
}

export interface SurveyValidationResult {
  isValid: boolean;
  fieldErrors: SurveyFieldError[];
}

export interface SurveyRow {
  version: number;
  surveyKey: string;
  title: string;
  primaryCategoryKey: string | null;
  secondaryCategoryKey: string | null;
  enable: number | boolean;
  startAt: Date | string | null;
  endAt: Date | string | null;
  repeatable: number | boolean;
  showRepeatableRecords: number | boolean;
  descriptionText: string | null;
  descriptionImageAssetKey: string | null;
  descriptionImage?: string | null;
  relatedWebsiteUrl: string | null;
  privacyPolicy: string | null;
  finishText: string | null;
  finishSendMessage: number | boolean;
  questions: unknown;
  settings: unknown;
  responseCount?: number | string;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  deletedAt: Date | string | null;
}

export interface SurveyReportRow {
  snapshot?: unknown;
  reportKey: string;
  surveyKey: string;
  lineUserId: string;
  displayName: string | null;
  answers: unknown;
  submittedAt: Date | string | null;
}

export interface SurveyCategoryRow {
  categoryKey: string;
  parentCategoryKey: string | null;
  name: string;
  sortOrder: number;
}

export interface SurveyImageAssetRow extends ProjectAssetDto {}
