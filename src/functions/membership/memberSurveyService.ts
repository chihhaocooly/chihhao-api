import {
  MemberConfigurationRepository,
  MemberDataRepository,
  MemberChange,
  MemberFieldDefinition,
  MemberMenuSyncRepository,
  SurveyReport,
  MemberFieldValueData,
  normalizeMemberFieldValue,
  shouldUpdateMemberField,
} from '@chihhaocooly/chihhao-package';
import { EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { MyError } from '../../@types/my-error';
import { SurveyAnswerPayload, SurveyQuestion, SurveySubmitRequest, SurveySubmitResponse } from '../survey/surveyTypes';
import { memberTransaction } from './memberTransaction';
import { integerInput, objectInput, requestHash, textInput } from './memberInput';
import { memberValidationContext } from './memberRegions';
import { trySyncMemberMenu } from './memberMenuWorker';
import { identitySnapshot } from './memberProfileService';
import { requireSubIdentity } from './memberConfigurationService';

export const attachMemberFields = async (
  questions: SurveyQuestion[],
  manager?: EntityManager
): Promise<SurveyQuestion[]> => {
  const repo = new MemberConfigurationRepository(manager);
  const used = new Set<string>();
  const ids = new Set<string>();
  const result: SurveyQuestion[] = [];
  for (const question of questions) {
    if (ids.has(question.id)) throw new MyError(400, '題目代碼不可重複');
    ids.add(question.id);
    const binding = question.memberFieldBinding;
    if (!binding) {
      if (question.type === 'member-field') throw new MyError(400, '會員欄位題目必須選擇連動欄位');
      result.push(question);
      continue;
    }
    if (!['overwrite', 'fill-empty'].includes(binding.updateMode) || used.has(binding.fieldId))
      throw new MyError(400, '欄位綁定重複或更新模式不正確');
    used.add(binding.fieldId);
    const field = await repo.findField(binding.fieldId);
    if (!field?.isEnabled) throw new MyError(400, '連動會員欄位不存在或已停用');
    const compatible =
      question.type === 'member-field' ||
      (question.type === 'text' && ['text', 'textarea'].includes(field.type)) ||
      (['radio', 'select'].includes(question.type) && field.type === 'single-select') ||
      (question.type === 'checkbox' && field.type === 'multi-select');
    if (!compatible) throw new MyError(400, '題型與連動欄位不相容，請改用會員欄位題型');
    if (
      question.type !== 'member-field' &&
      field.options.length &&
      (question.data ?? []).some(
        (option) => !field.options.some((item) => item.isEnabled && item.id === (option.value ?? option.title))
      )
    )
      throw new MyError(400, '題目選項必須使用會員欄位的選項代碼');
    const definition: MemberFieldDefinition = {
      id: field.id,
      presetKey: field.presetKey,
      label: field.label,
      type: field.type,
      isEnabled: field.isEnabled,
      sortOrder: field.sortOrder,
      options: field.options,
      validation: field.validation,
    };
    result.push({ ...question, memberField: definition });
  }
  return result;
};

const isEmpty = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && !value.trim()) ||
  (Array.isArray(value) && !value.length);
export const validateSurveyAnswers = (questions: SurveyQuestion[], raw: unknown): SurveyAnswerPayload[] => {
  if (!Array.isArray(raw) || raw.length > questions.length) throw new MyError(400, '問卷答案格式不正確');
  const supplied = new Map<string, Record<string, unknown>>();
  for (const value of raw) {
    const item = objectInput(value);
    const id = textInput(item.questionId, '題目代碼', 100);
    if (supplied.has(id) || !questions.some((question) => question.id === id))
      throw new MyError(400, '答案包含重複或不存在的題目');
    supplied.set(id, item);
  }
  return questions.map((question) => {
    const item = supplied.get(question.id);
    if (item && item.type !== question.type) throw new MyError(400, '答案題型不符，請重新載入問卷');
    let answer: MemberFieldValueData | null = null;
    if (question.memberField)
      answer = normalizeMemberFieldValue(question.memberField, item?.answer, memberValidationContext());
    else if (!isEmpty(item?.answer)) {
      const value = item!.answer;
      if (question.type === 'checkbox') {
        if (!Array.isArray(value) || value.some((option) => typeof option !== 'string'))
          throw new MyError(400, '複選題答案格式不正確');
        answer = [...new Set(value)] as string[];
      } else answer = textInput(value, question.title, 10000);
      if (question.type !== 'text') {
        const allowed = new Set((question.data ?? []).map((option) => option.value ?? option.title));
        if ((Array.isArray(answer) ? answer : [answer]).some((option) => !allowed.has(option)))
          throw new MyError(400, '答案包含無效選項');
      }
    }
    if (question.required && isEmpty(answer)) throw new MyError(400, `請填寫「${question.title}」`);
    const extraText: Record<string, string> = {};
    for (const option of question.data ?? []) {
      const key = option.value ?? option.title;
      if (!option.enableText || !(Array.isArray(answer) ? answer.includes(key) : answer === key)) continue;
      const extra = item?.extraText ? objectInput(item.extraText)[key] : null;
      extraText[key] = textInput(extra, `${question.title}補充說明`, 1000);
    }
    return {
      questionId: question.id,
      type: question.type,
      answer,
      ...(Object.keys(extraText).length ? { extraText } : {}),
    };
  });
};

export const submitMemberSurvey = async (request: SurveySubmitRequest): Promise<SurveySubmitResponse> => {
  const surveyKey = textInput(request.surveyId, '問卷代碼', 36);
  const requestId = textInput(request.requestId, '操作識別碼', 80);
  const surveyVersion = integerInput(request.surveyVersion);
  const hash = requestHash({ surveyKey, surveyVersion, answers: request.answers });
  let syncMemberId: string | null = null;
  const result = await memberTransaction(async (manager) => {
    const repo = new MemberDataRepository(manager);
    const config = new MemberConfigurationRepository(manager);
    const survey = await repo.lockSurvey(surveyKey);
    const created = await repo.ensureMember(request.userId);
    const member = await repo.lockMember(created.id);
    const previous = await repo.findOperation(member.id, requestId, 'survey', hash);
    if (previous) return previous.result as unknown as SurveySubmitResponse;
    if (survey.version !== surveyVersion) throw new MyError(409, '問卷已更新，請重新載入後填寫');
    if (
      !survey.enable ||
      (survey.startAt && new Date(survey.startAt).getTime() > Date.now()) ||
      (survey.endAt && new Date(survey.endAt).getTime() < Date.now())
    )
      throw new MyError(400, '此問卷目前未開放填寫');
    if (!survey.repeatable && (await repo.hasSurveyReport(surveyKey, member.lineUserId)))
      throw new MyError(409, '您已填寫過此問卷');
    const questions = await attachMemberFields(survey.questions as unknown as SurveyQuestion[], manager);
    const answers = validateSurveyAnswers(questions, request.answers);
    const form = await config.findForm(surveyKey);
    const reportKey = randomUUID();
    const current = await repo.listValues(member.id);
    const changes: Record<string, unknown>[] = [];
    for (const question of questions) {
      if (!question.memberFieldBinding || !question.memberField) continue;
      const after = answers.find((answer) => answer.questionId === question.id)!.answer;
      const before = current.find((value) => value.fieldId === question.memberFieldBinding!.fieldId)?.value ?? null;
      if (
        !shouldUpdateMemberField(before, after, question.memberFieldBinding.updateMode) ||
        JSON.stringify(before) === JSON.stringify(after)
      )
        continue;
      await repo.saveValue(member.id, question.memberField.id, after);
      changes.push({ fieldId: question.memberField.id, label: question.memberField.label, before, after });
    }
    let outcome: SurveySubmitResponse['membershipOutcome'] = 'none';
    let targetId = member.subIdentityId;
    if (form?.isEnabled) {
      if (!form.allowedSourceSubIdentityIds.includes(member.subIdentityId)) outcome = 'skipped-source';
      else {
        const target = await requireSubIdentity(manager, form.targetSubIdentityId);
        targetId = target.id;
        outcome = targetId === member.subIdentityId ? 'unchanged' : 'changed';
        if (outcome === 'changed') {
          await repo.appendChange(
            Object.assign(new MemberChange(), {
              memberId: member.id,
              kind: 'identity',
              source: 'survey',
              surveyKey,
              reportKey,
              before: await identitySnapshot(manager, member.subIdentityId),
              after: await identitySnapshot(manager, targetId),
            })
          );
          await new MemberMenuSyncRepository(manager).queue(member.id, target.richmenuKey);
          syncMemberId = member.id;
        }
      }
    }
    if (changes.length)
      await repo.appendChange(
        Object.assign(new MemberChange(), {
          memberId: member.id,
          kind: 'profile',
          source: 'survey',
          surveyKey,
          reportKey,
          before: {
            values: changes.map((change) => ({ fieldId: change.fieldId, label: change.label, value: change.before })),
          },
          after: {
            values: changes.map((change) => ({ fieldId: change.fieldId, label: change.label, value: change.after })),
          },
        })
      );
    if (changes.length || outcome === 'changed')
      await repo.updateMembership(member.id, member.membershipVersion, targetId);
    await repo.saveSurveyReport(
      Object.assign(new SurveyReport(), {
        reportKey,
        surveyKey,
        lineUserId: member.lineUserId,
        displayName: member.displayName,
        answers,
        submissionId: requestId,
        snapshot: {
          surveyVersion,
          surveyTitle: survey.title,
          questions,
          membershipOutcome: outcome,
          previousSubIdentityId: member.subIdentityId,
          subIdentityId: targetId,
          form: form?.isEnabled ? form : null,
        },
      })
    );
    const result = {
      reportKey,
      message: survey.finishText ?? '',
      membershipOutcome: outcome,
      menuSyncStatus: outcome === 'changed' ? ('pending' as const) : null,
    };
    await repo.completeOperation(member.id, requestId, 'survey', hash, result);
    return result;
  });
  if (syncMemberId) await trySyncMemberMenu(syncMemberId);
  return result;
};
