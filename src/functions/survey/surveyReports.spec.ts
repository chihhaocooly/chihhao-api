import { AppDataSource } from '@chihhaocooly/chihhao-package';
import {
  getMySurveyReport,
  getSurveyForAdmin,
  getSurveyReportForAdmin,
  listMySurveyReports,
  listSurveyReportsForAdmin,
} from './surveyService';
import { SurveyReportDetailDto, SurveyReportRow, SurveyRow } from './surveyTypes';

jest.mock('@chihhaocooly/chihhao-package', () => ({ AppDataSource: { query: jest.fn() } }));

const surveyKey = '0ef8a85b-2e50-4d3a-a21b-7e7be2b922a1';
const reportKey = '5afccff7-9de3-41f7-a238-dc6ecdc966d4';
const otherKey = '7afccff7-9de3-41f7-a238-dc6ecdc966d4';
const memberField = {
  id: 'fruit', label: '當時欄位', type: 'single-select',
  options: [{ id: 'apple', label: '當時蘋果' }],
};
const query = jest.mocked(AppDataSource.query);
let survey: SurveyRow | null;
let reports: SurveyReportRow[];
let liffFailure: Error | null;

const readers: { name: string; read: () => Promise<SurveyReportDetailDto[]> }[] = [
  { name: '本人列表', read: () => listMySurveyReports(surveyKey, 'Uowner') },
  { name: '本人明細', read: async () => [await getMySurveyReport(surveyKey, 'Uowner', reportKey)] },
  { name: '管理列表', read: async () => (await listSurveyReportsForAdmin(surveyKey)).items },
  { name: '管理明細', read: async () => [await getSurveyReportForAdmin(surveyKey, reportKey)] },
];

beforeEach(() => {
  survey = {
    surveyKey, version: 3, title: '現在問卷', enable: true, repeatable: true, showRepeatableRecords: true,
    questions: [{ id: 'fruit', title: '現在題目', type: 'text' }],
    primaryCategoryKey: null, secondaryCategoryKey: null, startAt: null, endAt: null,
    descriptionText: null, descriptionImageAssetKey: null, relatedWebsiteUrl: null, privacyPolicy: null,
    finishText: null, finishSendMessage: false, settings: null, createdAt: null, updatedAt: null, deletedAt: null,
  };
  reports = [{
    reportKey, surveyKey, lineUserId: 'Uowner', displayName: '填寫者',
    answers: [{ questionId: 'fruit', type: 'text', answer: '蘋果' }],
    submittedAt: '2026-09-09T08:00:00+08:00',
  }];
  liffFailure = null;
  query.mockReset().mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM site_line_setting')) {
      if (liffFailure) throw liffFailure;
      return [{ liffId: '123-app' }];
    }
    if (sql.includes('FROM survey_report')) {
      if (sql.includes('WHERE reportKey = ?')) {
        return reports.filter(row => row.reportKey === params?.[0] && row.surveyKey === params?.[1] && row.lineUserId === params?.[2]);
      }
      return reports.filter(row => row.surveyKey === params?.[0]
        && (!sql.includes('AND reportKey = ?') || row.reportKey === params?.[1])
        && (!sql.includes('AND lineUserId = ?') || row.lineUserId === params?.[1]));
    }
    if (sql.includes('FROM survey') && sql.includes('survey.deletedAt IS NULL')) {
      return survey && survey.surveyKey === params?.[0] && !survey.deletedAt ? [survey] : [];
    }
    throw new Error('Unexpected query in report read');
  });
});

for (const reader of readers) {
  describe(reader.name, () => {
    it('採用提交快照，保留會員值、舊選項定義與一般答案格式', async () => {
      reports[0].snapshot = { surveyTitle: '當時問卷', questions: [{ id: 'fruit', title: '當時題目', type: 'member-field', memberField }] };
      reports[0].answers = [
        { questionId: 'fruit', type: 'member-field', answer: 0 },
        { questionId: 'fruit', type: 'member-field', answer: false },
        { questionId: 'fruit', type: 'member-field', answer: { city: 'TPE' } },
        { questionId: 'fruit', type: 'member-field', answer: null },
        { questionId: ' unknown ', type: 'unsupported', answer: ['A', 12, 'B'], extraText: { other: '補充', ignored: 5 } },
        { questionId: 'number', type: 'text', answer: 123 },
        null, { questionId: '', answer: '略過' },
      ];
      const [result] = await reader.read();
      expect(result).toEqual({
        reportKey, surveyId: surveyKey, surveyTitle: '當時問卷', displayName: '填寫者', lineUserId: 'Uowner',
        submittedAt: '2026-09-09T00:00:00.000Z',
        answers: [
          ...[0, false, { city: 'TPE' }, null].map(answer => ({ questionId: 'fruit', questionTitle: '當時題目', type: 'member-field', memberField, answer, extraText: undefined })),
          { questionId: 'unknown', questionTitle: 'unknown', type: 'text', answer: ['A', 'B'], extraText: { other: '補充' }, memberField: undefined },
          { questionId: 'number', questionTitle: 'number', type: 'text', answer: '', extraText: undefined, memberField: undefined },
        ],
      });
    });

    it.each([undefined, null, '未解析的 JSON 字串', []])('沒有有效快照 %p 時使用當前題目', async (snapshot) => {
      reports[0].snapshot = snapshot;
      const [result] = await reader.read();
      expect(result.surveyTitle).toBe('現在問卷');
      expect(result.answers[0]).toEqual({ questionId: 'fruit', questionTitle: '現在題目', type: 'text', answer: '蘋果', extraText: undefined, memberField: undefined });
    });

    it('空快照題目與空標題不 fallback；無效日期及非陣列答案維持空值', async () => {
      reports[0].snapshot = { surveyTitle: '', questions: [] };
      let [result] = await reader.read();
      expect(result.surveyTitle).toBe('');
      expect(result.answers[0].questionTitle).toBe('fruit');
      reports[0].answers = '未解析的 JSON';
      reports[0].submittedAt = 'invalid';
      [result] = await reader.read();
      expect(result.answers).toEqual([]);
      expect(result.submittedAt).toBe('');
    });

    it('找不到問卷先回 404，不讀取回覆', async () => {
      survey = null;
      await expect(reader.read()).rejects.toMatchObject({ statusCode: 404, message: '問卷不存在' });
      expect(query.mock.calls.some(([sql]) => sql.includes('FROM survey_report'))).toBe(false);
    });
  });
}

describe('報表查詢政策', () => {
  it.each([
    [false, true], [true, false], [false, false], ['false', true], [true, 0],
  ])('本人需同時符合 repeatable=%p、showRepeatableRecords=%p', async (repeatable, showRecords) => {
    Object.assign(survey!, { repeatable, showRepeatableRecords: showRecords });
    for (const reader of readers.slice(0, 2)) {
      await expect(reader.read()).rejects.toMatchObject({ statusCode: 403, message: '此問卷未開放查看填寫紀錄' });
    }
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM survey_report'))).toBe(false);
  });

  it.each([true, 1, '1', 'true'])('本人旗標的既有真值 %p 保持可讀取', async (value) => {
    Object.assign(survey!, { repeatable: value, showRepeatableRecords: value });
    for (const reader of readers.slice(0, 2)) expect(await reader.read()).toHaveLength(1);
  });

  it('管理列表與明細不受本人旗標限制', async () => {
    Object.assign(survey!, { repeatable: false, showRepeatableRecords: false });
    for (const reader of readers.slice(2)) expect(await reader.read()).toHaveLength(1);
  });

  it('本人列表依身份篩選，明細無法讀其他本人或其他問卷的回覆', async () => {
    reports.push({ ...reports[0], reportKey: otherKey, lineUserId: 'Uother' });
    expect(await listMySurveyReports(surveyKey, 'Uowner')).toHaveLength(1);
    await expect(getMySurveyReport(surveyKey, 'Uowner', otherKey)).rejects.toMatchObject({ statusCode: 404 });
    reports[0].surveyKey = otherKey;
    await expect(getMySurveyReport(surveyKey, 'Uowner', reportKey)).rejects.toMatchObject({ statusCode: 404 });
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('reportKey = ? AND surveyKey = ? AND lineUserId = ?'), [reportKey, surveyKey, 'Uowner']);
  });

  it.each([['bad-key', reportKey], [surveyKey, 'bad-key']])('管理明細拒絕錯誤 UUID %p/%p，查詢前停止', async (surveyId, reportId) => {
    await expect(getSurveyReportForAdmin(surveyId, reportId)).rejects.toMatchObject({ statusCode: 400 });
    expect(query).not.toHaveBeenCalled();
  });

  it('管理列表及本人入口不新增 UUID 限制；空列表與缺少明細維持原行為', async () => {
    survey!.surveyKey = 'legacy';
    reports = [];
    expect(await listMySurveyReports('legacy', 'Uowner')).toEqual([]);
    expect(await listSurveyReportsForAdmin('legacy')).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    await expect(getMySurveyReport('legacy', 'Uowner', 'legacy-report')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('當前題目非法綁定即使有有效快照，管理列表仍在讀報表前拒絕', async () => {
    survey!.questions = [{ id: 'fruit', title: '題目', type: 'member-field', memberFieldBinding: { fieldId: 'fruit', updateMode: 'invalid' } }];
    reports[0].snapshot = { surveyTitle: '當時問卷', questions: [] };
    await expect(listSurveyReportsForAdmin(surveyKey)).rejects.toMatchObject({ statusCode: 400, message: '欄位更新模式不正確' });
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM survey_report'))).toBe(false);
  });
});

describe('管理列表搜尋與分頁', () => {
  beforeEach(() => {
    reports = [
      { ...reports[0], reportKey: 'latest', displayName: 'NeEdLe 名稱', lineUserId: 'Ufirst', answers: [], submittedAt: '2026-09-09T03:00:00Z' },
      { ...reports[0], reportKey: 'middle', displayName: null, lineUserId: 'UneEDle', answers: [], submittedAt: '2026-09-09T02:00:00Z' },
      { ...reports[0], reportKey: 'oldest', displayName: '其他', lineUserId: 'Uthird', answers: [{ questionId: 'fruit', type: 'text', answer: 'needle' }], submittedAt: '2026-09-09T01:00:00Z' },
    ];
  });

  it('搜尋三個原始欄位且過濾後分頁，保留 SQL 時間倒序', async () => {
    const result = await listSurveyReportsForAdmin(surveyKey, { q: ' NEEDLE ', page: 2, pageSize: 1 });
    expect(result).toMatchObject({ total: 3, page: 2, pageSize: 1 });
    expect(result.items.map(row => row.reportKey)).toEqual(['middle']);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('ORDER BY submittedAt DESC'), [surveyKey]);
    const byAnswer = await listSurveyReportsForAdmin(surveyKey, { q: '"questionid"' });
    expect(byAnswer.items.map(row => row.reportKey)).toEqual(['oldest']);
    expect(byAnswer.total).toBe(1);
  });

  it.each([
    [{ page: 0, pageSize: 0 }, 1, 20],
    [{ page: NaN, pageSize: NaN }, 1, 20],
    [{ page: -2, pageSize: -5 }, 1, 1],
    [{ page: 2, pageSize: 101 }, 2, 100],
    [{ page: 1.5, pageSize: 2 }, 1.5, 2],
  ])('保留 Number fallback/clamp %p', async (options, page, pageSize) => {
    const result = await listSurveyReportsForAdmin(surveyKey, options);
    expect(result).toMatchObject({ total: 3, page, pageSize });
  });

  it('搜尋不符及超過頁尾維持空 items，total 不混成當頁數量', async () => {
    expect(await listSurveyReportsForAdmin(surveyKey, { q: 'not-found' })).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(await listSurveyReportsForAdmin(surveyKey, { page: 5 })).toEqual({ items: [], total: 3, page: 5, pageSize: 20 });
  });
});

describe('管理問卷詳情', () => {
  it('管理 DTO 保留填寫網址及既有正規化', async () => {
    const item = await getSurveyForAdmin(surveyKey);
    expect(item).toMatchObject({ surveyKey, title: '現在問卷', fillUrl: `https://liff.line.me/123-app/survey?surveyId=${surveyKey}`, questions: [expect.objectContaining({ id: 'fruit', title: '現在題目', required: true })] });
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM site_line_setting'))).toBe(true);
  });

  it('缺問卷回 null，不查填寫網址；詳情仍傳遞設定查詢失敗', async () => {
    survey = null;
    expect(await getSurveyForAdmin(surveyKey)).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    survey = { surveyKey } as SurveyRow;
    liffFailure = new Error('settings unavailable');
    await expect(getSurveyForAdmin(surveyKey)).rejects.toBe(liffFailure);
  });
});

describe('報表的相依範圍', () => {
  it('LIFF 填寫入口設定故障不阻擋管理報表，也不查詢該設定', async () => {
    liffFailure = new Error('LIFF settings unavailable');
    const result = await listSurveyReportsForAdmin(surveyKey);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].reportKey).toBe(reportKey);
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM site_line_setting'))).toBe(false);
  });
});
