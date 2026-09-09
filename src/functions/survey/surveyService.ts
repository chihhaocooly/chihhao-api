import { getPrimaryLiffUrls } from '../siteSettings/primaryLiffUrls';
import { MemberDataRepository, MemberConfigurationRepository, MemberFieldValueData } from '@chihhaocooly/chihhao-package';
import { attachMemberFields, normalizeSurveyQuestionsForSave, submitMemberSurvey } from '../membership/memberSurveyService';
import { memberTransaction } from '../membership/memberTransaction';
import { objectInput, textInput } from '../membership/memberInput';
import { AppDataSource, ProjectAssetReferenceRepository, type ProjectAssetReferenceInput } from '@chihhaocooly/chihhao-package';
import { v4 as uuidv4, validate as isUuid } from 'uuid';
import { MyError } from '../../@types/my-error';
import {
  ListSurveyReportsResult,
  ListSurveysResult,
  SaveSurveyCategoriesRequest,
  SaveSurveyRequest,
  SurveyAdminDto,
  SurveyAnswerPayload,
  SurveyCategoryDto,
  SurveyCategoryRow,
  SurveyFieldError,
  SurveyQuestion,
  SurveyQuestionOption,
  SurveyReportDetailDto,
  SurveyReportRow,
  SurveyRow,
  SurveyRuntimeDto,
  SurveyRuntimeStatusInfo,
  SurveyValidationResult,
  surveyQuestionTypes,
} from './surveyTypes';

const defaultPage = 1;
const defaultPageSize = 20;
const surveyAssetEntityType = 'survey';
const descriptionImageUsageProfileKey = 'surveyManagement.descriptionImage';

export const getSurveyRuntime = async (surveyId: string, userId: string): Promise<SurveyRuntimeDto> => {
  const survey = await findSurvey(surveyId);
  if (!survey) {
    throw new MyError(404, '問卷不存在');
  }

  const hasSubmitted = await hasUserSubmitted(survey.surveyKey, userId);
  const statusInfo = resolveRuntimeStatus(survey, hasSubmitted);

  return {
    id: survey.surveyKey,
    version: survey.version,
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
    questions: await attachMemberFields(normalizeQuestions(survey.questions)),
  };
};

export const submitSurvey = submitMemberSurvey;

export const listMySurveyReports = async (
  surveyId: string,
  userId: string,
): Promise<SurveyReportDetailDto[]> => {
  const survey = await findSurvey(surveyId);
  if (!survey) {
    throw new MyError(404, '問卷不存在');
  }

  if (!toBoolean(survey.repeatable) || !toBoolean(survey.showRepeatableRecords)) {
    throw new MyError(403, '此問卷未開放查看填寫紀錄');
  }

  const reports = await AppDataSource.query(
    `
      SELECT reportKey, surveyKey, lineUserId, displayName, answers, snapshot, submittedAt
      FROM survey_report
      WHERE surveyKey = ? AND lineUserId = ?
      ORDER BY submittedAt DESC
    `,
    [survey.surveyKey, userId],
  ) as SurveyReportRow[];

  return reports.map((report) => toReportDetailDto(survey, report));
};

export const getMySurveyReport = async (
  surveyId: string,
  userId: string,
  reportKey: string,
): Promise<SurveyReportDetailDto> => {
  const survey = await findSurvey(surveyId);
  if (!survey) {
    throw new MyError(404, '問卷不存在');
  }

  if (!toBoolean(survey.repeatable) || !toBoolean(survey.showRepeatableRecords)) {
    throw new MyError(403, '此問卷未開放查看填寫紀錄');
  }

  const reports = await AppDataSource.query(
    `
      SELECT reportKey, surveyKey, lineUserId, displayName, answers, snapshot, submittedAt
      FROM survey_report
      WHERE reportKey = ? AND surveyKey = ? AND lineUserId = ?
      LIMIT 1
    `,
    [reportKey, survey.surveyKey, userId],
  ) as SurveyReportRow[];

  const report = reports[0];
  if (!report) {
    throw new MyError(404, '填寫紀錄不存在');
  }

  return toReportDetailDto(survey, report);
};

export const listSurveys = async (options: {
  q?: string;
  status?: string;
  primaryCategoryKey?: string;
  secondaryCategoryKey?: string;
  page?: number;
  pageSize?: number;
}): Promise<ListSurveysResult> => {
  const page = Math.max(Number(options.page ?? defaultPage) || defaultPage, 1);
  const pageSize = Math.min(Math.max(Number(options.pageSize ?? defaultPageSize) || defaultPageSize, 1), 100);
  const allSurveys = await AppDataSource.query(
    `
      SELECT survey.*, asset.publicUrl AS descriptionImage, COUNT(survey_report.reportKey) AS responseCount
      FROM survey
      LEFT JOIN survey_report ON survey_report.surveyKey = survey.surveyKey
      LEFT JOIN project_asset asset ON asset.assetKey = survey.descriptionImageAssetKey
      WHERE survey.deletedAt IS NULL
      GROUP BY survey.surveyKey
      ORDER BY survey.updatedAt DESC, survey.createdAt DESC
    `,
  ) as SurveyRow[];

  const search = options.q?.trim().toLowerCase();
  const filtered = allSurveys.filter((survey) => {
    if (options.status && options.status !== 'all' && getAdminStatus(survey) !== options.status) {
      return false;
    }

    if (options.primaryCategoryKey && survey.primaryCategoryKey !== options.primaryCategoryKey) {
      return false;
    }

    if (options.secondaryCategoryKey && survey.secondaryCategoryKey !== options.secondaryCategoryKey) {
      return false;
    }

    if (!search) {
      return true;
    }

    return survey.title.toLowerCase().includes(search);
  });

  const start = (page - 1) * pageSize;
  const buildFillUrl = await getSurveyFillUrlBuilder();

  return {
    items: filtered.slice(start, start + pageSize).map((survey) => toAdminDto(survey, buildFillUrl)),
    total: filtered.length,
    page,
    pageSize,
  };
};

export const getSurveyForAdmin = async (surveyKey: string): Promise<SurveyAdminDto | null> => {
  const surveys = await AppDataSource.query(
    `
      SELECT survey.*, asset.publicUrl AS descriptionImage, COUNT(survey_report.reportKey) AS responseCount
      FROM survey
      LEFT JOIN survey_report ON survey_report.surveyKey = survey.surveyKey
      LEFT JOIN project_asset asset ON asset.assetKey = survey.descriptionImageAssetKey
      WHERE survey.surveyKey = ? AND survey.deletedAt IS NULL
      GROUP BY survey.surveyKey
      LIMIT 1
    `,
    [surveyKey],
  ) as SurveyRow[];

  if (!surveys[0]) {
    return null;
  }

  return toAdminDto(surveys[0], await getSurveyFillUrlBuilder());
};

export const createSurveyForAdmin = async (payload: SaveSurveyRequest): Promise<{
  validation: SurveyValidationResult;
  item: SurveyAdminDto | null;
}> => {
  const normalized = normalizeSavePayload(payload);
  if (!normalized.validation.isValid || !normalized.value) {
    return { validation: normalized.validation, item: null };
  }

  const surveyKey = uuidv4();
  await memberTransaction(async manager => {
    await attachMemberFields(normalized.value!.questions, manager);
    await manager.query(
    `
      INSERT INTO survey
        (
          surveyKey, title, primaryCategoryKey, secondaryCategoryKey, enable, startAt, endAt,
          repeatable, showRepeatableRecords, descriptionText, descriptionImageAssetKey,
          relatedWebsiteUrl, privacyPolicy, finishText, finishSendMessage, questions, settings,
          createdAt, updatedAt
        )
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [
      surveyKey,
      normalized.value!.title,
      normalized.value!.primaryCategoryKey,
      normalized.value!.secondaryCategoryKey,
      normalized.value!.enable ? 1 : 0,
      normalized.value!.startAt,
      normalized.value!.endAt,
      normalized.value!.repeatable ? 1 : 0,
      normalized.value!.showRepeatableRecords ? 1 : 0,
      normalized.value!.descriptionText,
      normalized.value!.descriptionImageAssetKey,
      normalized.value!.relatedWebsiteUrl,
      normalized.value!.privacyPolicy,
      normalized.value!.finishText,
      normalized.value!.finishSendMessage ? 1 : 0,
      JSON.stringify(normalized.value!.questions),
      JSON.stringify(normalized.value!.settings ?? null),
    ],
  );
  });

  await replaceSurveyImageReference(surveyKey, normalized.value!.title, normalized.value!.descriptionImageAssetKey);

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

  const normalized = normalizeSavePayload({ ...current, ...payload }, payload.questions !== undefined);
  if (!normalized.validation.isValid || !normalized.value) {
    return { validation: normalized.validation, item: null };
  }

  await memberTransaction(async manager => {
    const locked = await new MemberDataRepository(manager).lockSurvey(surveyKey);
    if (locked.version !== current.version) throw new MyError(409, '問卷已更新，請重新載入');
    await attachMemberFields(normalized.value!.questions, manager);
    const config = new MemberConfigurationRepository(manager);
    if (!normalized.value!.enable && (await config.getSettings())?.defaultSurveyKey === surveyKey) throw new MyError(409, '請先更換預設會員問卷');
    await manager.query(
    `
      UPDATE survey
      SET
        title = ?,
        primaryCategoryKey = ?,
        secondaryCategoryKey = ?,
        enable = ?,
        startAt = ?,
        endAt = ?,
        repeatable = ?,
        showRepeatableRecords = ?,
        descriptionText = ?,
        descriptionImageAssetKey = ?,
        relatedWebsiteUrl = ?,
        privacyPolicy = ?,
        finishText = ?,
        finishSendMessage = ?,
        questions = CAST(? AS JSON),
        settings = CAST(? AS JSON),
        version = version + 1,
        updatedAt = CURRENT_TIMESTAMP
      WHERE surveyKey = ? AND deletedAt IS NULL
    `,
    [
      normalized.value!.title,
      normalized.value!.primaryCategoryKey,
      normalized.value!.secondaryCategoryKey,
      normalized.value!.enable ? 1 : 0,
      normalized.value!.startAt,
      normalized.value!.endAt,
      normalized.value!.repeatable ? 1 : 0,
      normalized.value!.showRepeatableRecords ? 1 : 0,
      normalized.value!.descriptionText,
      normalized.value!.descriptionImageAssetKey,
      normalized.value!.relatedWebsiteUrl,
      normalized.value!.privacyPolicy,
      normalized.value!.finishText,
      normalized.value!.finishSendMessage ? 1 : 0,
      JSON.stringify(normalized.value!.questions),
      JSON.stringify(normalized.value!.settings ?? null),
      surveyKey,
    ],
  );
  });

  await replaceSurveyImageReference(surveyKey, normalized.value!.title, normalized.value!.descriptionImageAssetKey);

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
    questions: source.questions.map((question) => question.memberFieldBinding
      ? { ...question, type: 'member-field' as const, data: [], placeholder: undefined }
      : question),
  });

  return result.item;
};

export const deleteSurveyForAdmin = async (surveyKey: string): Promise<boolean> => {
  const result = await memberTransaction(async manager => {
    await new MemberDataRepository(manager).lockSurvey(surveyKey);
    const config = new MemberConfigurationRepository(manager);
    if (await config.findForm(surveyKey) || (await config.getSettings())?.defaultSurveyKey === surveyKey) throw new MyError(409, '請先移除會員問卷設定');
    return manager.query(
    `
      UPDATE survey
      SET deletedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
      WHERE surveyKey = ? AND deletedAt IS NULL
    `,
    [surveyKey],
  );
  });

  const deleted = getAffectedRows(result) > 0;
  if (deleted) {
    await new ProjectAssetReferenceRepository().deleteForEntity(surveyAssetEntityType, surveyKey);
  }

  return deleted;
};

export const getSurveyReportForAdmin = async (
  surveyKey: string,
  reportKey: string,
): Promise<SurveyReportDetailDto> => {
  if (!isUuid(surveyKey) || !isUuid(reportKey)) {
    throw new MyError(400, '問卷或回覆代碼格式無效');
  }

  const survey = await findSurvey(surveyKey);
  if (!survey) {
    throw new MyError(404, '問卷不存在');
  }

  const reports = await AppDataSource.query(
    `
      SELECT reportKey, surveyKey, lineUserId, displayName, answers, snapshot, submittedAt
      FROM survey_report
      WHERE surveyKey = ? AND reportKey = ?
      LIMIT 1
    `,
    [surveyKey, reportKey],
  ) as SurveyReportRow[];
  if (!reports[0]) {
    throw new MyError(404, '填寫紀錄不存在');
  }

  return toReportDetailDto(survey, reports[0]);
};

export const listSurveyReportsForAdmin = async (
  surveyKey: string,
  options: { q?: string; page?: number; pageSize?: number } = {},
): Promise<ListSurveyReportsResult> => {
  const survey = await getSurveyForAdmin(surveyKey);
  if (!survey) {
    throw new MyError(404, '問卷不存在');
  }

  const page = Math.max(Number(options.page ?? defaultPage) || defaultPage, 1);
  const pageSize = Math.min(Math.max(Number(options.pageSize ?? defaultPageSize) || defaultPageSize, 1), 100);
  const reports = await AppDataSource.query(
    `
      SELECT reportKey, surveyKey, lineUserId, displayName, answers, snapshot, submittedAt
      FROM survey_report
      WHERE surveyKey = ?
      ORDER BY submittedAt DESC
    `,
    [surveyKey],
  ) as SurveyReportRow[];

  const search = options.q?.trim().toLowerCase();
  const filtered = search
    ? reports.filter((report) => report.displayName?.toLowerCase().includes(search)
      || report.lineUserId.toLowerCase().includes(search)
      || JSON.stringify(report.answers).toLowerCase().includes(search))
    : reports;
  const start = (page - 1) * pageSize;
  const surveyRow = adminDtoToSurveyRow(survey);

  return {
    items: filtered.slice(start, start + pageSize).map((report) => toReportDetailDto(surveyRow, report)),
    total: filtered.length,
    page,
    pageSize,
  };
};

export const listSurveyCategories = async (): Promise<{ categories: SurveyCategoryDto[] }> => {
  const rows = await AppDataSource.query(
    `
      SELECT categoryKey, parentCategoryKey, name, sortOrder
      FROM survey_category
      WHERE deletedAt IS NULL
      ORDER BY parentCategoryKey IS NOT NULL, sortOrder ASC, createdAt ASC
    `,
  ) as SurveyCategoryRow[];

  return { categories: toCategoryTree(rows) };
};

export const saveSurveyCategories = async (
  payload: SaveSurveyCategoriesRequest,
): Promise<{ validation: SurveyValidationResult; categories: SurveyCategoryDto[] }> => {
  const normalized = normalizeCategoryPayload(payload);
  if (!normalized.validation.isValid) {
    return { validation: normalized.validation, categories: [] };
  }

  const currentRows = await AppDataSource.query(
    `
      SELECT categoryKey, parentCategoryKey, name, sortOrder
      FROM survey_category
      WHERE deletedAt IS NULL
    `,
  ) as SurveyCategoryRow[];
  const currentKeys = new Set(currentRows.map((row) => row.categoryKey));
  const incomingKeys = new Set<string>();
  for (const category of normalized.categories) {
    incomingKeys.add(category.categoryKey);
    for (const child of category.children) {
      incomingKeys.add(child.categoryKey);
    }
  }

  const removedKeys = [...currentKeys].filter((key) => !incomingKeys.has(key));
  const usedRemovedKeys = removedKeys.length > 0 ? await findUsedCategoryKeys(removedKeys) : [];
  if (usedRemovedKeys.length > 0) {
    return {
      validation: {
        isValid: false,
        fieldErrors: [{
          field: 'categories',
          message: '分類仍被問卷使用，請先調整問卷分類後再刪除',
        }],
      },
      categories: [],
    };
  }

  if (removedKeys.length > 0) {
    await AppDataSource.query(
      `
        UPDATE survey_category
        SET deletedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
        WHERE categoryKey IN (${removedKeys.map(() => '?').join(',')})
      `,
      removedKeys,
    );
  }

  for (const category of normalized.categories) {
    await upsertCategory(category.categoryKey, null, category.name, category.sortOrder);
    for (const child of category.children) {
      await upsertCategory(child.categoryKey, category.categoryKey, child.name, child.sortOrder);
    }
  }

  return {
    validation: { isValid: true, fieldErrors: [] },
    ...(await listSurveyCategories()),
  };
};

const findSurvey = async (surveyKey: string): Promise<SurveyRow | null> => {
  const surveys = await AppDataSource.query(
    `
      SELECT survey.*, asset.publicUrl AS descriptionImage, COUNT(survey_report.reportKey) AS responseCount
      FROM survey
      LEFT JOIN survey_report ON survey_report.surveyKey = survey.surveyKey
      LEFT JOIN project_asset asset ON asset.assetKey = survey.descriptionImageAssetKey
      WHERE survey.surveyKey = ? AND survey.deletedAt IS NULL
      GROUP BY survey.surveyKey
      LIMIT 1
    `,
    [surveyKey],
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

  if (startAt !== null && now < startAt) {
    return { state: 'not-started', message: '此問卷尚未開始。' };
  }

  if (endAt !== null && now > endAt) {
    return { state: 'expired', message: '此問卷已結束。' };
  }

  if (!toBoolean(survey.repeatable) && hasSubmitted) {
    return { state: 'submitted', message: '您已填寫過此問卷。' };
  }

  return undefined;
};

interface NormalizedSurveyValue {
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
  relatedWebsiteUrl: string | null;
  privacyPolicy: string | null;
  finishText: string | null;
  finishSendMessage: boolean;
  questions: SurveyQuestion[];
  settings: Record<string, unknown> | null;
}

const normalizeSavePayload = (
  payload: SaveSurveyRequest,
  shouldValidateQuestionBindings = true,
): {
  validation: SurveyValidationResult;
  value: NormalizedSurveyValue | null;
} => {
  const fieldErrors: SurveyFieldError[] = [];
  const title = normalizeNullableString(payload.title, 100);

  if (!title) {
    fieldErrors.push({ field: 'title', message: '請輸入問卷標題' });
  }

  const parsedQuestions = normalizeQuestions(payload.questions);
  const questions = shouldValidateQuestionBindings ? normalizeSurveyQuestionsForSave(parsedQuestions) : parsedQuestions;
  if (questions.length === 0) {
    fieldErrors.push({ field: 'questions', message: '請至少建立一個題目' });
  }

  if (fieldErrors.length > 0 || !title) {
    return { validation: { isValid: false, fieldErrors }, value: null };
  }

  return {
    validation: { isValid: true, fieldErrors: [] },
    value: {
      title,
      primaryCategoryKey: normalizeNullableString(payload.primaryCategoryKey, 80),
      secondaryCategoryKey: normalizeNullableString(payload.secondaryCategoryKey, 80),
      enable: toBoolean(payload.enable),
      startAt: normalizeDateValue(payload.startAt),
      endAt: normalizeDateValue(payload.endAt),
      repeatable: toBoolean(payload.repeatable),
      showRepeatableRecords: toBoolean(payload.showRepeatableRecords),
      descriptionText: normalizeNullableString(payload.descriptionText, 10000),
      descriptionImageAssetKey: normalizeNullableString(payload.descriptionImageAssetKey, 36),
      relatedWebsiteUrl: normalizeNullableString(payload.relatedWebsiteUrl, 2048),
      privacyPolicy: normalizeNullableString(payload.privacyPolicy, 10000),
      finishText: normalizeNullableString(payload.finishText, 10000),
      finishSendMessage: toBoolean(payload.finishSendMessage),
      questions,
      settings: normalizeRecord(payload.settings),
    },
  };
};

const toAdminDto = (survey: SurveyRow, buildFillUrl: SurveyFillUrlBuilder | null = null): SurveyAdminDto => ({
  version: survey.version,
  surveyKey: survey.surveyKey,
  title: survey.title,
  primaryCategoryKey: survey.primaryCategoryKey,
  secondaryCategoryKey: survey.secondaryCategoryKey,
  enable: toBoolean(survey.enable),
  startAt: toIsoString(survey.startAt),
  endAt: toIsoString(survey.endAt),
  repeatable: toBoolean(survey.repeatable),
  showRepeatableRecords: toBoolean(survey.showRepeatableRecords),
  descriptionText: survey.descriptionText,
  descriptionImageAssetKey: survey.descriptionImageAssetKey,
  descriptionImage: survey.descriptionImage ?? null,
  relatedWebsiteUrl: survey.relatedWebsiteUrl,
  privacyPolicy: survey.privacyPolicy,
  finishText: survey.finishText,
  finishSendMessage: toBoolean(survey.finishSendMessage),
  questions: normalizeQuestions(survey.questions),
  settings: normalizeRecord(survey.settings),
  fillUrl: buildFillUrl ? buildFillUrl(survey.surveyKey) : null,
  responseCount: Number(survey.responseCount ?? 0) || 0,
  createdAt: toIsoString(survey.createdAt),
  updatedAt: toIsoString(survey.updatedAt),
  deletedAt: toIsoString(survey.deletedAt),
});

type SurveyFillUrlBuilder = (surveyKey: string) => string;

const getSurveyFillUrlBuilder = async (): Promise<SurveyFillUrlBuilder | null> =>
  (await getPrimaryLiffUrls())?.survey ?? null;

const adminDtoToSurveyRow = (survey: SurveyAdminDto): SurveyRow => ({
  ...survey,
  enable: survey.enable,
  repeatable: survey.repeatable,
  showRepeatableRecords: survey.showRepeatableRecords,
  finishSendMessage: survey.finishSendMessage,
  questions: survey.questions,
  settings: survey.settings,
});

const toReportDetailDto = (survey: SurveyRow, report: SurveyReportRow): SurveyReportDetailDto => {
  const snapshot = normalizeRecord(report.snapshot);
  const questions = normalizeQuestions(snapshot?.questions ?? survey.questions);
  const snapshotQuestions = Array.isArray(snapshot?.questions) ? snapshot.questions as SurveyQuestion[] : [];
  const answers = normalizeAnswers(report.answers);

  return {
    reportKey: report.reportKey,
    surveyId: survey.surveyKey,
    surveyTitle: typeof snapshot?.surveyTitle === 'string' ? snapshot.surveyTitle : survey.title,
    displayName: report.displayName,
    lineUserId: report.lineUserId,
    submittedAt: toIsoString(report.submittedAt) ?? '',
    answers: answers.map((answer) => {
      const question = questions.find((item) => item.id === answer.questionId);
      return {
        questionId: answer.questionId,
        questionTitle: question?.title ?? answer.questionId,
        memberField: snapshotQuestions.find(item => item.id === answer.questionId)?.memberField,
        type: answer.type,
        answer: answer.answer,
        extraText: answer.extraText,
      };
    }),
  };
};

const getAdminStatus = (survey: SurveyRow): string => {
  if (!toBoolean(survey.enable)) {
    return 'disabled';
  }

  const now = Date.now();
  const startAt = toTimeValue(survey.startAt);
  const endAt = toTimeValue(survey.endAt);

  if (startAt !== null && startAt > now) {
    return 'upcoming';
  }

  if (endAt !== null && endAt < now) {
    return 'ended';
  }

  return 'active';
};

const normalizeQuestions = (value: unknown): SurveyQuestion[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeQuestion)
    .filter((question): question is SurveyQuestion => question !== null);
};

const normalizeQuestion = (value: unknown, index: number): SurveyQuestion | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = typeof record['type'] === 'string' && surveyQuestionTypes.includes(record['type'] as SurveyQuestion['type'])
    ? record['type'] as SurveyQuestion['type']
    : 'text';
  const title = normalizeNullableString(record['title'], 200);
  if (!title) {
    return null;
  }

  return {
    id: normalizeNullableString(record['id'], 100) ?? `question-${index + 1}`,
    title,
    type,
    required: record['required'] !== false,
    ...(record['memberFieldBinding'] ? { memberFieldBinding: (() => {
      const binding = objectInput(record['memberFieldBinding']);
      if (!['overwrite', 'fill-empty'].includes(String(binding.updateMode))) throw new MyError(400, '欄位更新模式不正確');
      return { fieldId: textInput(binding.fieldId, '會員欄位代碼', 80), updateMode: binding.updateMode as 'overwrite' | 'fill-empty' };
    })() } : {}),
    description: normalizeNullableString(record['description'], 1000) ?? undefined,
    placeholder: normalizeNullableString(record['placeholder'], 200) ?? undefined,
    data: Array.isArray(record['data'])
      ? record['data'].map(normalizeQuestionOption).filter((option): option is SurveyQuestionOption => option !== null)
      : [],
  };
};

const normalizeQuestionOption = (value: unknown): SurveyQuestionOption | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const title = normalizeNullableString(record['title'], 200);
  if (!title) {
    return null;
  }

  return {
    title,
    value: normalizeNullableString(record['value'], 200) ?? undefined,
    enableText: toBoolean(record['enableText']),
    group: normalizeNullableString(record['group'], 100) ?? undefined,
    all: toBoolean(record['all']),
  };
};

const normalizeAnswers = (value: unknown): SurveyAnswerPayload[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((answer) => {
    if (typeof answer !== 'object' || answer === null) {
      return [];
    }

    const record = answer as Record<string, unknown>;
    const questionId = normalizeNullableString(record['questionId'], 100);
    if (!questionId) {
      return [];
    }

    return [{
      questionId,
      type: typeof record['type'] === 'string' && surveyQuestionTypes.includes(record['type'] as SurveyQuestion['type'])
        ? record['type'] as SurveyQuestion['type']
        : 'text',
      answer: record['type'] === 'member-field' ? record['answer'] as MemberFieldValueData | null : normalizeAnswerValue(record['answer']),
      extraText: normalizeStringRecord(record['extraText']),
    }];
  });
};

const normalizeAnswerValue = (value: unknown): string | string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return typeof value === 'string' ? value : '';
};

const normalizeCategoryPayload = (
  payload: SaveSurveyCategoriesRequest,
): { validation: SurveyValidationResult; categories: SurveyCategoryDto[] } => {
  const fieldErrors: SurveyFieldError[] = [];
  const categoriesInput = Array.isArray(payload.categories) ? payload.categories : [];
  const categories = categoriesInput.map((categoryInput, categoryIndex) => {
    const record = typeof categoryInput === 'object' && categoryInput !== null
      ? categoryInput as Record<string, unknown>
      : {};
    const name = normalizeNullableString(record['name'], 80);
    if (!name) {
      fieldErrors.push({ field: `categories.${categoryIndex}.name`, message: '請輸入大分類名稱' });
    }

    const categoryKey = normalizeNullableString(record['categoryKey'], 36) ?? uuidv4();
    const childrenInput = Array.isArray(record['children']) ? record['children'] : [];
    const children = childrenInput.map((childInput, childIndex) => {
      const childRecord = typeof childInput === 'object' && childInput !== null
        ? childInput as Record<string, unknown>
        : {};
      const childName = normalizeNullableString(childRecord['name'], 80);
      if (!childName) {
        fieldErrors.push({ field: `categories.${categoryIndex}.children.${childIndex}.name`, message: '請輸入小分類名稱' });
      }

      return {
        categoryKey: normalizeNullableString(childRecord['categoryKey'], 36) ?? uuidv4(),
        parentCategoryKey: categoryKey,
        name: childName ?? '',
        sortOrder: childIndex,
      };
    });

    return {
      categoryKey,
      name: name ?? '',
      sortOrder: categoryIndex,
      children,
    };
  });

  return {
    validation: { isValid: fieldErrors.length === 0, fieldErrors },
    categories,
  };
};

const toCategoryTree = (rows: SurveyCategoryRow[]): SurveyCategoryDto[] => {
  const childrenByParent = new Map<string, SurveyCategoryRow[]>();
  for (const row of rows) {
    if (row.parentCategoryKey) {
      childrenByParent.set(row.parentCategoryKey, [...(childrenByParent.get(row.parentCategoryKey) ?? []), row]);
    }
  }

  return rows
    .filter((row) => row.parentCategoryKey === null)
    .map((row) => ({
      categoryKey: row.categoryKey,
      name: row.name,
      sortOrder: Number(row.sortOrder) || 0,
      children: (childrenByParent.get(row.categoryKey) ?? []).map((child) => ({
        categoryKey: child.categoryKey,
        parentCategoryKey: row.categoryKey,
        name: child.name,
        sortOrder: Number(child.sortOrder) || 0,
      })),
    }));
};

const findUsedCategoryKeys = async (categoryKeys: string[]): Promise<string[]> => {
  const rows = await AppDataSource.query(
    `
      SELECT DISTINCT categoryKey
      FROM (
        SELECT primaryCategoryKey AS categoryKey FROM survey WHERE deletedAt IS NULL AND primaryCategoryKey IN (${categoryKeys.map(() => '?').join(',')})
        UNION
        SELECT secondaryCategoryKey AS categoryKey FROM survey WHERE deletedAt IS NULL AND secondaryCategoryKey IN (${categoryKeys.map(() => '?').join(',')})
      ) used_categories
      WHERE categoryKey IS NOT NULL
    `,
    [...categoryKeys, ...categoryKeys],
  ) as Array<{ categoryKey: string }>;

  return rows.map((row) => row.categoryKey);
};

const upsertCategory = async (
  categoryKey: string,
  parentCategoryKey: string | null,
  name: string,
  sortOrder: number,
): Promise<void> => {
  await AppDataSource.query(
    `
      INSERT INTO survey_category
        (categoryKey, parentCategoryKey, name, sortOrder, createdAt, updatedAt, deletedAt)
      VALUES
        (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
      ON DUPLICATE KEY UPDATE
        parentCategoryKey = VALUES(parentCategoryKey),
        name = VALUES(name),
        sortOrder = VALUES(sortOrder),
        deletedAt = NULL,
        updatedAt = CURRENT_TIMESTAMP
    `,
    [categoryKey, parentCategoryKey, name, sortOrder],
  );
};

const replaceSurveyImageReference = async (
  surveyKey: string,
  title: string,
  assetKey: string | null,
): Promise<void> => {
  const references: ProjectAssetReferenceInput[] = assetKey
    ? [{
      assetKey,
      ownerModule: 'surveyManagement',
      entityType: surveyAssetEntityType,
      entityKey: surveyKey,
      entityLabel: title,
      usageProfileKey: descriptionImageUsageProfileKey,
      usageRole: 'surveyDescriptionImage',
      usagePath: 'descriptionImageAssetKey',
      isBlockingDelete: true,
    }]
    : [];

  await new ProjectAssetReferenceRepository().replaceForEntity(surveyAssetEntityType, surveyKey, references);
};

const normalizeNullableString = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
};

const normalizeDateValue = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 19).replace('T', ' ');
};

const normalizeRecord = (value: unknown): Record<string, unknown> | null => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
};

const normalizeStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1' || value === 'true';

const toIsoString = (value: Date | string | null | undefined): string | null => {
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
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const getAffectedRows = (result: unknown): number => {
  if (Array.isArray(result)) {
    return getAffectedRows(result[0]);
  }

  if (typeof result === 'object' && result !== null) {
    const record = result as { affectedRows?: number; affected?: number };
    return record.affectedRows ?? record.affected ?? 0;
  }

  return 0;
};
