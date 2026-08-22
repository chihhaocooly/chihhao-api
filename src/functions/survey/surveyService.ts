import { AppDataSource } from '@chihhaocooly/chihhao-package';
import { v4 as uuidv4 } from 'uuid';
import { MyError } from '../../@types/my-error';
import {
  ListSurveysResult,
  SaveSurveyRequest,
  SurveyAdminDto,
  SurveyAnswerPayload,
  SurveyFieldError,
  SurveyQuestion,
  SurveyQuestionOption,
  SurveyReportDetailDto,
  SurveyReportRow,
  SurveyReportSummaryDto,
  SurveyRow,
  SurveyRuntimeDto,
  SurveyRuntimeStatusInfo,
  SurveySubmitRequest,
  SurveySubmitResponse,
  SurveyValidationResult,
  surveyQuestionTypes,
} from './surveyTypes';

const defaultPage = 1;
const defaultPageSize = 20;

export const getSurveyRuntime = async (site: string, surveyId: string, userId: string): Promise<SurveyRuntimeDto> => {
  const survey = await findSurvey(site, surveyId);
  if (!survey) {
    throw new MyError(404, '問卷不存在');
  }

  const hasSubmitted = await hasUserSubmitted(survey.surveyKey, userId);
  const statusInfo = resolveRuntimeStatus(survey, hasSubmitted);

  return {
    id: survey.surveyKey,
    site: survey.site,
    title: survey.title,
    descriptionText: survey.descriptionText ?? undefined,
    descriptionImage: survey.descriptionImage ?? undefined,
    relatedWebsiteUrl: survey.relatedWebsiteUrl ?? undefined,
    privacyPolicy: survey.privacyPolicy ?? undefined,
    startDate: toIsoString(survey.startAt) ?? undefined,
    endDate: toIsoString(survey.endAt) ?? undefined,
    enable: toBoolean(survey.enable),
    repeatable: toBoolean(survey.repeatable),
    showRepeatableRecords: toBoolean(survey.showRepeatableRecords),
    finishText: survey.finishText ?? undefined,
    finishSendMessage: toBoolean(survey.finishSendMessage),
    hasSubmitted,
    canViewReports: toBoolean(survey.repeatable) && toBoolean(survey.showRepeatableRecords),
    statusInfo,
    questions: normalizeQuestions(survey.questions),
  };
};

export const submitSurvey = async (request: SurveySubmitRequest): Promise<SurveySubmitResponse> => {
  const survey = await findSurvey(request.site, request.surveyId);
  if (!survey) {
    throw new MyError(404, '問卷不存在');
  }

  const hasSubmitted = await hasUserSubmitted(survey.surveyKey, request.userId);
  const statusInfo = resolveRuntimeStatus(survey, hasSubmitted);
  if (statusInfo) {
    throw new MyError(400, statusInfo.message);
  }

  const questions = normalizeQuestions(survey.questions);
  const validation = validateAnswers(questions, request.answers);
  if (!validation.isValid) {
    throw new MyError(400, validation.fieldErrors[0]?.message ?? '問卷答案不完整');
  }

  const reportKey = uuidv4();
  await AppDataSource.query(
    `
      INSERT INTO survey_report
        (reportKey, surveyKey, site, lineUserId, displayName, answers, submittedAt)
      VALUES
        (?, ?, ?, ?, ?, CAST(? AS JSON), CURRENT_TIMESTAMP)
    `,
    [
      reportKey,
      survey.surveyKey,
      survey.site,
      request.userId,
      normalizeNullableString(request.displayName, 120),
      JSON.stringify(request.answers),
    ],
  );

  return {
    reportKey,
    message: survey.finishText ?? undefined,
  };
};

export const listMySurveyReports = async (
  site: string,
  surveyId: string,
  userId: string,
): Promise<SurveyReportSummaryDto[]> => {
  const survey = await findSurvey(site, surveyId);
  if (!survey) {
    throw new MyError(404, '問卷不存在');
  }

  if (!toBoolean(survey.repeatable) || !toBoolean(survey.showRepeatableRecords)) {
    throw new MyError(403, '此問卷未開放查看填寫紀錄');
  }

  const reports = await AppDataSource.query(
    `
      SELECT reportKey, surveyKey, site, lineUserId, displayName, answers, submittedAt
      FROM survey_report
      WHERE surveyKey = ? AND site = ? AND lineUserId = ?
      ORDER BY submittedAt DESC
    `,
    [survey.surveyKey, survey.site, userId],
  ) as SurveyReportRow[];

  return reports.map((report) => ({
    reportKey: report.reportKey,
    surveyId: survey.surveyKey,
    surveyTitle: survey.title,
    submittedAt: toIsoString(report.submittedAt) ?? '',
  }));
};

export const getMySurveyReport = async (
  site: string,
  surveyId: string,
  userId: string,
  reportKey: string,
): Promise<SurveyReportDetailDto> => {
  const survey = await findSurvey(site, surveyId);
  if (!survey) {
    throw new MyError(404, '問卷不存在');
  }

  if (!toBoolean(survey.repeatable) || !toBoolean(survey.showRepeatableRecords)) {
    throw new MyError(403, '此問卷未開放查看填寫紀錄');
  }

  const reports = await AppDataSource.query(
    `
      SELECT reportKey, surveyKey, site, lineUserId, displayName, answers, submittedAt
      FROM survey_report
      WHERE reportKey = ? AND surveyKey = ? AND site = ? AND lineUserId = ?
      LIMIT 1
    `,
    [reportKey, survey.surveyKey, survey.site, userId],
  ) as SurveyReportRow[];

  const report = reports[0];
  if (!report) {
    throw new MyError(404, '填寫紀錄不存在');
  }

  const questions = normalizeQuestions(survey.questions);
  const answers = normalizeAnswers(report.answers);

  return {
    reportKey: report.reportKey,
    surveyId: survey.surveyKey,
    surveyTitle: survey.title,
    submittedAt: toIsoString(report.submittedAt) ?? '',
    answers: answers.map((answer) => {
      const question = questions.find((item) => item.id === answer.questionId);
      return {
        questionId: answer.questionId,
        questionTitle: question?.title ?? answer.questionId,
        type: answer.type,
        answer: answer.answer,
        extraText: answer.extraText,
      };
    }),
  };
};

export const listSurveys = async (options: {
  q?: string;
  site?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<ListSurveysResult> => {
  const page = Math.max(Number(options.page ?? defaultPage) || defaultPage, 1);
  const pageSize = Math.min(Math.max(Number(options.pageSize ?? defaultPageSize) || defaultPageSize, 1), 100);
  const allSurveys = await AppDataSource.query(
    `
      SELECT survey.*, COUNT(survey_report.reportKey) AS responseCount
      FROM survey
      LEFT JOIN survey_report ON survey_report.surveyKey = survey.surveyKey
      WHERE survey.deletedAt IS NULL
      GROUP BY survey.surveyKey
      ORDER BY survey.updatedAt DESC, survey.createdAt DESC
    `,
  ) as SurveyRow[];

  const search = options.q?.trim().toLowerCase();
  const filtered = allSurveys.filter((survey) => {
    if (options.site && survey.site !== options.site) {
      return false;
    }

    if (options.status && options.status !== 'all' && getAdminStatus(survey) !== options.status) {
      return false;
    }

    if (!search) {
      return true;
    }

    return survey.title.toLowerCase().includes(search)
      || survey.site.toLowerCase().includes(search)
      || (survey.categoryKey?.toLowerCase().includes(search) ?? false);
  });

  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize).map(toAdminDto),
    total: filtered.length,
    page,
    pageSize,
  };
};

export const getSurveyForAdmin = async (surveyKey: string): Promise<SurveyAdminDto | null> => {
  const surveys = await AppDataSource.query(
    `
      SELECT survey.*, COUNT(survey_report.reportKey) AS responseCount
      FROM survey
      LEFT JOIN survey_report ON survey_report.surveyKey = survey.surveyKey
      WHERE survey.surveyKey = ? AND survey.deletedAt IS NULL
      GROUP BY survey.surveyKey
      LIMIT 1
    `,
    [surveyKey],
  ) as SurveyRow[];

  return surveys[0] ? toAdminDto(surveys[0]) : null;
};

export const createSurveyForAdmin = async (payload: SaveSurveyRequest): Promise<{
  validation: SurveyValidationResult;
  item: SurveyAdminDto | null;
}> => {
  const normalized = normalizeSavePayload(payload, true);
  if (!normalized.validation.isValid || !normalized.value) {
    return { validation: normalized.validation, item: null };
  }

  const surveyKey = uuidv4();
  await AppDataSource.query(
    `
      INSERT INTO survey
        (
          surveyKey, site, title, categoryKey, enable, startAt, endAt, repeatable,
          showRepeatableRecords, descriptionText, descriptionImage, relatedWebsiteUrl,
          privacyPolicy, finishText, finishSendMessage, questions, settings, createdAt, updatedAt
        )
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [
      surveyKey,
      normalized.value.site,
      normalized.value.title,
      normalized.value.categoryKey,
      normalized.value.enable ? 1 : 0,
      normalized.value.startAt,
      normalized.value.endAt,
      normalized.value.repeatable ? 1 : 0,
      normalized.value.showRepeatableRecords ? 1 : 0,
      normalized.value.descriptionText,
      normalized.value.descriptionImage,
      normalized.value.relatedWebsiteUrl,
      normalized.value.privacyPolicy,
      normalized.value.finishText,
      normalized.value.finishSendMessage ? 1 : 0,
      JSON.stringify(normalized.value.questions),
      JSON.stringify(normalized.value.settings ?? null),
    ],
  );

  return {
    validation: normalized.validation,
    item: await getSurveyForAdmin(surveyKey),
  };
};

export const updateSurveyForAdmin = async (
  surveyKey: string,
  payload: SaveSurveyRequest,
): Promise<{
  validation: SurveyValidationResult | null;
  item: SurveyAdminDto | null;
}> => {
  const current = await getSurveyForAdmin(surveyKey);
  if (!current) {
    return { validation: null, item: null };
  }

  const normalized = normalizeSavePayload({ ...current, ...payload }, false);
  if (!normalized.validation.isValid || !normalized.value) {
    return { validation: normalized.validation, item: null };
  }

  await AppDataSource.query(
    `
      UPDATE survey
      SET
        site = ?,
        title = ?,
        categoryKey = ?,
        enable = ?,
        startAt = ?,
        endAt = ?,
        repeatable = ?,
        showRepeatableRecords = ?,
        descriptionText = ?,
        descriptionImage = ?,
        relatedWebsiteUrl = ?,
        privacyPolicy = ?,
        finishText = ?,
        finishSendMessage = ?,
        questions = CAST(? AS JSON),
        settings = CAST(? AS JSON),
        updatedAt = CURRENT_TIMESTAMP
      WHERE surveyKey = ? AND deletedAt IS NULL
    `,
    [
      normalized.value.site,
      normalized.value.title,
      normalized.value.categoryKey,
      normalized.value.enable ? 1 : 0,
      normalized.value.startAt,
      normalized.value.endAt,
      normalized.value.repeatable ? 1 : 0,
      normalized.value.showRepeatableRecords ? 1 : 0,
      normalized.value.descriptionText,
      normalized.value.descriptionImage,
      normalized.value.relatedWebsiteUrl,
      normalized.value.privacyPolicy,
      normalized.value.finishText,
      normalized.value.finishSendMessage ? 1 : 0,
      JSON.stringify(normalized.value.questions),
      JSON.stringify(normalized.value.settings ?? null),
      surveyKey,
    ],
  );

  return {
    validation: normalized.validation,
    item: await getSurveyForAdmin(surveyKey),
  };
};

export const copySurveyForAdmin = async (surveyKey: string): Promise<SurveyAdminDto | null> => {
  const source = await getSurveyForAdmin(surveyKey);
  if (!source) {
    return null;
  }

  const result = await createSurveyForAdmin({
    ...source,
    title: `${source.title} 複本`.slice(0, 100),
    enable: false,
  });

  return result.item;
};

export const deleteSurveyForAdmin = async (surveyKey: string): Promise<boolean> => {
  const result = await AppDataSource.query(
    `
      UPDATE survey
      SET deletedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
      WHERE surveyKey = ? AND deletedAt IS NULL
    `,
    [surveyKey],
  ) as { affectedRows?: number } | { affected?: number };

  return getAffectedRows(result) > 0;
};

export const listSurveyReportsForAdmin = async (surveyKey: string): Promise<SurveyReportDetailDto[]> => {
  const survey = await getSurveyForAdmin(surveyKey);
  if (!survey) {
    throw new MyError(404, '問卷不存在');
  }

  const reports = await AppDataSource.query(
    `
      SELECT reportKey, surveyKey, site, lineUserId, displayName, answers, submittedAt
      FROM survey_report
      WHERE surveyKey = ?
      ORDER BY submittedAt DESC
    `,
    [surveyKey],
  ) as SurveyReportRow[];

  return reports.map((report) => ({
    reportKey: report.reportKey,
    surveyId: survey.surveyKey,
    surveyTitle: survey.title,
    submittedAt: toIsoString(report.submittedAt) ?? '',
    answers: normalizeAnswers(report.answers).map((answer) => {
      const question = survey.questions.find((item) => item.id === answer.questionId);
      return {
        questionId: answer.questionId,
        questionTitle: question?.title ?? answer.questionId,
        type: answer.type,
        answer: answer.answer,
        extraText: answer.extraText,
      };
    }),
  }));
};

const findSurvey = async (site: string, surveyKey: string): Promise<SurveyRow | null> => {
  const surveys = await AppDataSource.query(
    `
      SELECT survey.*, COUNT(survey_report.reportKey) AS responseCount
      FROM survey
      LEFT JOIN survey_report ON survey_report.surveyKey = survey.surveyKey
      WHERE survey.site = ? AND survey.surveyKey = ? AND survey.deletedAt IS NULL
      GROUP BY survey.surveyKey
      LIMIT 1
    `,
    [site, surveyKey],
  ) as SurveyRow[];

  return surveys[0] ?? null;
};

const hasUserSubmitted = async (surveyKey: string, userId: string): Promise<boolean> => {
  const rows = await AppDataSource.query(
    `
      SELECT reportKey
      FROM survey_report
      WHERE surveyKey = ? AND lineUserId = ?
      LIMIT 1
    `,
    [surveyKey, userId],
  ) as { reportKey: string }[];

  return rows.length > 0;
};

const resolveRuntimeStatus = (survey: SurveyRow, hasSubmitted: boolean): SurveyRuntimeStatusInfo | undefined => {
  if (!toBoolean(survey.enable)) {
    return { state: 'disabled', message: '此問卷尚未開放填寫。' };
  }

  const now = Date.now();
  const startAt = toTimeValue(survey.startAt);
  const endAt = toTimeValue(survey.endAt);

  if (startAt && startAt > now) {
    return { state: 'not-started', message: '此問卷尚未開始。' };
  }

  if (endAt && endAt < now) {
    return { state: 'expired', message: '此問卷已結束。' };
  }

  if (!toBoolean(survey.repeatable) && hasSubmitted) {
    return { state: 'submitted', message: '您已填寫過此問卷。' };
  }

  return undefined;
};

const validateAnswers = (questions: SurveyQuestion[], answers: SurveyAnswerPayload[]): SurveyValidationResult => {
  const fieldErrors: SurveyFieldError[] = [];

  for (const question of questions) {
    const answer = answers.find((item) => item.questionId === question.id);
    if (!answer) {
      if (question.required) {
        fieldErrors.push({ field: question.id, message: `請完成「${question.title}」` });
      }
      continue;
    }

    if (question.required && !hasAnswerValue(answer.answer)) {
      fieldErrors.push({ field: question.id, message: `請完成「${question.title}」` });
    }

    for (const option of question.data ?? []) {
      if (!option.enableText || !isOptionSelected(answer.answer, option)) {
        continue;
      }

      const value = answer.extraText?.[optionValue(option)] ?? '';
      if (value.trim().length === 0) {
        fieldErrors.push({ field: question.id, message: `請補充「${option.title}」說明` });
      }
    }
  }

  return {
    isValid: fieldErrors.length === 0,
    fieldErrors,
  };
};

interface NormalizedSurveyValue {
  site: string;
  title: string;
  categoryKey: string | null;
  enable: boolean;
  startAt: string | null;
  endAt: string | null;
  repeatable: boolean;
  showRepeatableRecords: boolean;
  descriptionText: string | null;
  descriptionImage: string | null;
  relatedWebsiteUrl: string | null;
  privacyPolicy: string | null;
  finishText: string | null;
  finishSendMessage: boolean;
  questions: SurveyQuestion[];
  settings: Record<string, unknown> | null;
}

const normalizeSavePayload = (
  payload: SaveSurveyRequest,
  requireSite: boolean,
): {
  validation: SurveyValidationResult;
  value: NormalizedSurveyValue | null;
} => {
  const fieldErrors: SurveyFieldError[] = [];
  const site = normalizeNullableString(payload.site, 80);
  const title = normalizeNullableString(payload.title, 100);
  const questions = normalizeQuestions(payload.questions);

  if (requireSite && !site) {
    fieldErrors.push({ field: 'site', message: '請輸入站台代碼' });
  }

  if (!title) {
    fieldErrors.push({ field: 'title', message: '請輸入問卷標題' });
  }

  if (questions.length === 0) {
    fieldErrors.push({ field: 'questions', message: '請至少建立一個題目' });
  }

  if (fieldErrors.length > 0 || !site || !title) {
    return {
      validation: { isValid: false, fieldErrors },
      value: null,
    };
  }

  return {
    validation: { isValid: true, fieldErrors },
    value: {
      site,
      title,
      categoryKey: normalizeNullableString(payload.categoryKey, 80),
      enable: normalizeBoolean(payload.enable),
      startAt: normalizeDateString(payload.startAt),
      endAt: normalizeDateString(payload.endAt),
      repeatable: normalizeBoolean(payload.repeatable),
      showRepeatableRecords: normalizeBoolean(payload.showRepeatableRecords),
      descriptionText: normalizeNullableString(payload.descriptionText, 10000),
      descriptionImage: normalizeNullableString(payload.descriptionImage, 2048),
      relatedWebsiteUrl: normalizeNullableString(payload.relatedWebsiteUrl, 2048),
      privacyPolicy: normalizeNullableString(payload.privacyPolicy, 10000),
      finishText: normalizeNullableString(payload.finishText, 10000),
      finishSendMessage: normalizeBoolean(payload.finishSendMessage),
      questions,
      settings: normalizeRecord(payload.settings),
    },
  };
};

const toAdminDto = (survey: SurveyRow): SurveyAdminDto => ({
  surveyKey: survey.surveyKey,
  site: survey.site,
  title: survey.title,
  categoryKey: survey.categoryKey,
  enable: toBoolean(survey.enable),
  startAt: toIsoString(survey.startAt),
  endAt: toIsoString(survey.endAt),
  repeatable: toBoolean(survey.repeatable),
  showRepeatableRecords: toBoolean(survey.showRepeatableRecords),
  descriptionText: survey.descriptionText,
  descriptionImage: survey.descriptionImage,
  relatedWebsiteUrl: survey.relatedWebsiteUrl,
  privacyPolicy: survey.privacyPolicy,
  finishText: survey.finishText,
  finishSendMessage: toBoolean(survey.finishSendMessage),
  questions: normalizeQuestions(survey.questions),
  settings: normalizeRecord(survey.settings),
  responseCount: Number(survey.responseCount ?? 0) || 0,
  createdAt: toIsoString(survey.createdAt),
  updatedAt: toIsoString(survey.updatedAt),
  deletedAt: toIsoString(survey.deletedAt),
});

const getAdminStatus = (survey: SurveyRow): string => {
  if (!toBoolean(survey.enable)) {
    return 'disabled';
  }

  const now = Date.now();
  const startAt = toTimeValue(survey.startAt);
  const endAt = toTimeValue(survey.endAt);

  if (startAt && startAt > now) {
    return 'upcoming';
  }

  if (endAt && endAt < now) {
    return 'ended';
  }

  return 'active';
};

const normalizeQuestions = (value: unknown): SurveyQuestion[] => {
  const rawQuestions = parseJsonArray(value);
  return rawQuestions
    .map((rawQuestion, index) => normalizeQuestion(rawQuestion, index))
    .filter((question): question is SurveyQuestion => question !== null);
};

const normalizeQuestion = (value: unknown, index: number): SurveyQuestion | null => {
  if (!isRecord(value)) {
    return null;
  }

  const type = typeof value['type'] === 'string' && surveyQuestionTypes.includes(value['type'] as SurveyQuestion['type'])
    ? value['type'] as SurveyQuestion['type']
    : null;
  const title = normalizeNullableString(value['title'], 200);

  if (!type || !title) {
    return null;
  }

  return {
    id: normalizeNullableString(value['id'], 80) ?? `question-${index + 1}`,
    title,
    type,
    required: normalizeBoolean(value['required']),
    description: normalizeNullableString(value['description'], 1000) ?? undefined,
    placeholder: normalizeNullableString(value['placeholder'], 200) ?? undefined,
    data: parseJsonArray(value['data'])
      .map(normalizeQuestionOption)
      .filter((option): option is SurveyQuestionOption => option !== null),
  };
};

const normalizeQuestionOption = (value: unknown): SurveyQuestionOption | null => {
  if (!isRecord(value)) {
    return null;
  }

  const title = normalizeNullableString(value['title'], 200);
  if (!title) {
    return null;
  }

  return {
    title,
    value: normalizeNullableString(value['value'], 200) ?? undefined,
    enableText: normalizeBoolean(value['enableText']),
    group: normalizeNullableString(value['group'], 80) ?? undefined,
    all: normalizeBoolean(value['all']),
  };
};

const normalizeAnswers = (value: unknown): SurveyAnswerPayload[] => {
  return parseJsonArray(value)
    .filter(isRecord)
    .map((answer) => ({
      questionId: normalizeNullableString(answer['questionId'], 80) ?? '',
      type: typeof answer['type'] === 'string' && surveyQuestionTypes.includes(answer['type'] as SurveyQuestion['type'])
        ? answer['type'] as SurveyQuestion['type']
        : 'text',
      answer: normalizeAnswerValue(answer['answer']),
      extraText: normalizeStringRecord(answer['extraText']),
    }))
    .filter((answer) => answer.questionId.length > 0);
};

const normalizeAnswerValue = (value: unknown): string | string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return typeof value === 'string' ? value : '';
};

const parseJsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const normalizeRecord = (value: unknown): Record<string, unknown> | null => {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
};

const normalizeStringRecord = (value: unknown): Record<string, string> | undefined => {
  const record = normalizeRecord(value);
  if (!record) {
    return undefined;
  }

  const entries = Object.entries(record)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const normalizeNullableString = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized.slice(0, maxLength) : null;
};

const normalizeDateString = (value: unknown): string | null => {
  const normalized = normalizeNullableString(value, 40);
  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ');
};

const normalizeBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';

const toBoolean = (value: number | boolean): boolean => value === true || value === 1;

const hasAnswerValue = (value: string | string[]): boolean => Array.isArray(value)
  ? value.length > 0
  : value.trim().length > 0;

const isOptionSelected = (answer: string | string[], option: SurveyQuestionOption): boolean => {
  const value = optionValue(option);
  return Array.isArray(answer) ? answer.includes(value) : answer === value;
};

const optionValue = (option: SurveyQuestionOption): string => option.value ?? option.title;

const toIsoString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toTimeValue = (value: Date | string | null): number | null => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const getAffectedRows = (result: { affectedRows?: number } | { affected?: number }): number => {
  if ('affectedRows' in result && typeof result.affectedRows === 'number') {
    return result.affectedRows;
  }

  return 'affected' in result && typeof result.affected === 'number' ? result.affected : 0;
};
