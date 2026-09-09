import { MemberConfigurationRepository, MemberField } from '@chihhaocooly/chihhao-package';
import { attachMemberFields, normalizeSurveyQuestionsForSave, validateSurveyAnswers } from './memberSurveyService';
import { SurveyQuestion } from '../survey/surveyTypes';
const question = (type: 'number' | 'boolean'): SurveyQuestion => ({
  id: 'q',
  title: '問題',
  type: 'member-field',
  required: true,
  memberField: {
    id: 'field',
    presetKey: null,
    label: '欄位',
    type,
    isEnabled: true,
    sortOrder: 0,
    options: [],
    validation: {},
  },
});

describe('會員題目儲存及舊題型相容', () => {
  const field = Object.assign(new MemberField(), {
    id: 'gender', presetKey: 'gender', label: '性別', type: 'single-select', isEnabled: true,
    sortOrder: 0, validation: {},
    options: [{ id: 'female', label: '女性', isEnabled: true }],
  });
  const bound = (type: SurveyQuestion['type']): SurveyQuestion => ({
    id: 'q', title: '性別', type, required: true,
    memberFieldBinding: { fieldId: 'gender', updateMode: 'fill-empty' },
    data: [{ title: '女性', value: 'female' }],
  });
  beforeEach(() => jest.spyOn(MemberConfigurationRepository.prototype, 'findField').mockResolvedValue(field));
  afterEach(() => jest.restoreAllMocks());

  test.each(['text', 'radio', 'checkbox', 'select'] as const)('拒絕新 %s 題型綁定', (type) => {
    expect(() => normalizeSurveyQuestionsForSave([bound(type)])).toThrow('一般題型不可連動');
  });
  test('未綁定一般題目保留自訂選項', () => {
    const q = { ...bound('checkbox'), memberFieldBinding: undefined };
    expect(normalizeSurveyQuestionsForSave([q])).toEqual([q]);
  });
  test('會員題目必須選欄位，且不使用自訂選項', async () => {
    expect(() => normalizeSurveyQuestionsForSave([{ ...bound('member-field'), memberFieldBinding: undefined }])).toThrow('必須選擇');
    const source = bound('member-field');
    const saved = normalizeSurveyQuestionsForSave([source]);
    expect(saved[0].data).toEqual([]);
    expect(source.data).toHaveLength(1);
    const attached = await attachMemberFields(saved);
    expect(attached[0].memberField?.options).toEqual(field.options);
    expect(attached[0].memberFieldBinding?.updateMode).toBe('fill-empty');
  });
  test.each(['radio', 'select'] as const)('舊 %s 性別題仍可讀取與提交', async (type) => {
    const questions = await attachMemberFields([bound(type)]);
    expect(questions[0].type).toBe(type);
    expect(questions[0].data).toEqual(bound(type).data);
    expect(validateSurveyAnswers(questions, [{ questionId: 'q', type, answer: 'female' }])[0].answer).toBe('female');
  });
  test('舊複選性別仍拒絕、會員欄位驗證仍有效', async () => {
    await expect(attachMemberFields([bound('checkbox')])).rejects.toThrow('不相容');
    await expect(attachMemberFields([bound('member-field'), { ...bound('member-field'), id: 'q2' }])).rejects.toThrow('重複');
    jest.mocked(MemberConfigurationRepository.prototype.findField).mockResolvedValue({ ...field, isEnabled: false });
    await expect(attachMemberFields([bound('member-field')])).rejects.toThrow('已停用');
    jest.mocked(MemberConfigurationRepository.prototype.findField).mockResolvedValue(null);
    await expect(attachMemberFields([bound('member-field')])).rejects.toThrow('不存在');
  });
});
describe('問卷答案驗證', () => {
  test.each([
    ['number', 0],
    ['boolean', false],
  ] as const)('保留 %s 的零值／否', (type, answer) => {
    expect(validateSurveyAnswers([question(type)], [{ questionId: 'q', type: 'member-field', answer }])[0].answer).toBe(
      answer
    );
  });
  test('拒絕重複題目、未知選項、錯誤型別', () => {
    const q: SurveyQuestion = { id: 'q', title: '選項', type: 'radio', required: true, data: [{ title: 'A' }] };
    const answer = { questionId: 'q', type: 'radio', answer: 'A' };
    expect(() => validateSurveyAnswers([q], [answer, answer])).toThrow();
    expect(() => validateSurveyAnswers([q], [{ ...answer, answer: 'B' }])).toThrow('無效選項');
    expect(() => validateSurveyAnswers([q], [{ ...answer, type: 'text' }])).toThrow('題型');
  });
});
