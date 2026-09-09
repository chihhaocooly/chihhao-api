import { validateSurveyAnswers } from './memberSurveyService';
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
