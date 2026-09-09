import { AppDataSource, MemberConfigurationRepository, MemberDataRepository, MemberField, ProjectAssetReferenceRepository } from '@chihhaocooly/chihhao-package';
import { EntityManager } from 'typeorm';
import { memberTransaction } from '../membership/memberTransaction';
import { copySurveyForAdmin, createSurveyForAdmin, updateSurveyForAdmin } from './surveyService';
import { SurveyQuestion, SurveyRow } from './surveyTypes';

jest.mock('../membership/memberTransaction', () => ({ memberTransaction: jest.fn() }));

describe('管理問卷儲存邊界', () => {
  const question: SurveyQuestion = {
    id: 'question-1', title: '性別', type: 'radio', required: true,
    memberFieldBinding: { fieldId: 'gender', updateMode: 'fill-empty' },
    data: [{ title: '女性', value: 'female' }],
  };
  const source = {
    surveyKey: 'survey', title: '舊問卷', version: 1, questions: [question], enable: false,
    repeatable: true, showRepeatableRecords: true, finishSendMessage: false, responseCount: 0,
  } as SurveyRow;
  let savedQuestions: SurveyQuestion[];
  let query: jest.Mock;
  beforeEach(() => {
    savedQuestions = [];
    query = jest.fn(async (_sql: string, params: unknown[]) => {
      const serialized = params.find(value => typeof value === 'string' && value.includes('"question-1"'));
      savedQuestions = JSON.parse(String(serialized)) as SurveyQuestion[];
      return [];
    });
    jest.mocked(memberTransaction).mockImplementation(async work => work({ query } as unknown as EntityManager));
    jest.spyOn(AppDataSource, 'query').mockImplementation(async (sql: string) => sql.includes('FROM survey') ? [source] : []);
    jest.spyOn(MemberDataRepository.prototype, 'lockSurvey').mockResolvedValue(source as Awaited<ReturnType<MemberDataRepository['lockSurvey']>>);
    jest.spyOn(MemberConfigurationRepository.prototype, 'getSettings').mockResolvedValue(null);
    jest.spyOn(MemberConfigurationRepository.prototype, 'findField').mockResolvedValue(Object.assign(new MemberField(), {
      id: 'gender', label: '性別', type: 'single-select', isEnabled: true, options: [
        { id: 'female', label: '女性', isEnabled: true },
      ], validation: {},
    }));
    jest.spyOn(ProjectAssetReferenceRepository.prototype, 'replaceForEntity').mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  test('新增及明確更新題目拒絕一般題型綁定，未寫入 DB', async () => {
    await expect(createSurveyForAdmin({ title: '問卷', questions: [question] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(updateSurveyForAdmin('survey', { questions: [question] })).rejects.toMatchObject({ statusCode: 400 });
    expect(query).not.toHaveBeenCalled();
  });
  test('只修改啟用狀態保留舊題型與選項', async () => {
    await updateSurveyForAdmin('survey', { enable: true });
    expect(savedQuestions[0]).toMatchObject(question);
  });
  test('會員題目儲存時移除自訂選項及提示文字', async () => {
    await updateSurveyForAdmin('survey', { questions: [{ ...question, type: 'member-field', placeholder: 'old' }] });
    expect(savedQuestions[0]).toMatchObject({ type: 'member-field', data: [], memberFieldBinding: question.memberFieldBinding });
    expect(savedQuestions[0].placeholder).toBeUndefined();
  });
  test('複製舊綁定問卷轉換複本，保留原問卷', async () => {
    await copySurveyForAdmin('survey');
    expect(savedQuestions[0]).toMatchObject({ type: 'member-field', data: [], memberFieldBinding: question.memberFieldBinding });
    expect(source.questions).toEqual([question]);
  });
});
