import { AppDataSource, MemberConfigurationRepository, MemberField, MemberForm } from '@chihhaocooly/chihhao-package';
import { EntityManager } from 'typeorm';
import { FieldEditingInfo, IdentityGroup, SurveyReference } from './memberSettingsTypes';
import { groupRevision, orderRevision } from './memberSettingsInput';
import { MyError } from '../../@types/my-error';

type SurveyRow = { surveyKey: string; title: string; enable: boolean; questions: unknown };
const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const json = (value: unknown): unknown => (typeof value === 'string' ? JSON.parse(value) : value);
const surveyReference = (survey: SurveyRow): SurveyReference => ({
  surveyKey: survey.surveyKey,
  title: survey.title,
  isEnabled: !!survey.enable,
});

export const readIdentities = async (manager: EntityManager = AppDataSource.manager) => {
  const repo = new MemberConfigurationRepository(manager);
  const [parents, children, forms, surveys, menus, counts, members] = await Promise.all([
    repo.listIdentities(),
    repo.listSubIdentities(),
    repo.listForms(),
    manager.query('SELECT surveyKey, title, enable FROM survey WHERE deletedAt IS NULL') as Promise<SurveyRow[]>,
    manager.query('SELECT richmenuKey, name, imageUrl FROM richmenu') as Promise<
      { richmenuKey: string; name: string; imageUrl: string }[]
    >,
    manager.query(`SELECT member.subIdentityId, sync.status, COUNT(*) AS total FROM member_menu_sync sync
      INNER JOIN line_member member ON member.id = sync.memberId WHERE member.subIdentityId IS NOT NULL
      GROUP BY member.subIdentityId, sync.status`) as Promise<
      { subIdentityId: string; status: string; total: number | string }[]
    >,
    manager.query(
      'SELECT subIdentityId, COUNT(*) AS total FROM line_member WHERE subIdentityId IS NOT NULL GROUP BY subIdentityId'
    ) as Promise<{ subIdentityId: string; total: number | string }[]>,
  ]);
  const menuMap = new Map(menus.map((menu) => [menu.richmenuKey, menu]));
  const surveyMap = new Map(surveys.map((survey) => [survey.surveyKey, survey]));
  const refs = (id: string): SurveyReference[] =>
    forms
      .filter((form) => formUsesSub(form, id))
      .map((form) => ({
        surveyKey: form.surveyKey,
        title: surveyMap.get(form.surveyKey)?.title ?? '未知問卷',
        isEnabled: form.isEnabled,
      }));
  const items: IdentityGroup[] = parents.map((parent) => ({
    ...parent,
    children: children
      .filter((child) => child.identityId === parent.id)
      .map((child) => ({
        ...child,
        references: {
          memberCount: Number(members.find((row) => row.subIdentityId === child.id)?.total ?? 0),
          surveys: refs(child.id),
        },
        richmenu: child.richmenuKey ? menuMap.get(child.richmenuKey) ?? null : null,
        syncSummary: Object.fromEntries(
          counts.filter((row) => row.subIdentityId === child.id).map((row) => [row.status, Number(row.total)])
        ),
      })),
  }));
  return { items, capabilities: { identityGroupEditing: true, ordering: true }, orderRevision: orderRevision(parents) };
};
export const formUsesSub = (form: MemberForm, id: string): boolean =>
  form.targetSubIdentityId === id || form.allowedSourceSubIdentityIds.includes(id);
export const readIdentityGroup = async (id: string, manager: EntityManager = AppDataSource.manager) => {
  const item = (await readIdentities(manager)).items.find((parent) => parent.id === id);
  if (!item) throw new MyError(404, '找不到身份');
  return { item, revision: groupRevision(item, item.children) };
};

export const readFieldEditing = async (
  fields: MemberField[],
  manager: EntityManager
): Promise<Map<string, FieldEditingInfo>> => {
  const [counts, values, surveys] = await Promise.all([
    manager.query('SELECT fieldId, COUNT(*) AS total FROM member_field_value GROUP BY fieldId') as Promise<
      { fieldId: string; total: number | string }[]
    >,
    // 只讀取選項代碼的 distinct 值，不載入姓名、聯絡方式或會員識別碼。
    manager.query(`SELECT v.fieldId, CAST(v.value AS CHAR) AS optionValue FROM member_field_value v
      INNER JOIN member_field f ON f.id = v.fieldId WHERE f.type IN ('single-select', 'multi-select')
      GROUP BY v.fieldId, CAST(v.value AS CHAR)`) as Promise<{ fieldId: string; optionValue: string }[]>,
    manager.query('SELECT surveyKey, title, enable, questions FROM survey WHERE deletedAt IS NULL') as Promise<
      SurveyRow[]
    >,
  ]);
  const parsedSurveys = surveys.map((survey) => ({ ...survey, questions: json(survey.questions) }));
  return new Map(
    fields.map((field) => {
      const valueCount = Number(counts.find((row) => row.fieldId === field.id)?.total ?? 0);
      const usedOptions = new Set(
        values
          .filter((row) => row.fieldId === field.id)
          .flatMap((row) => {
            const value = asObject(json(row.optionValue))?.value;
            return typeof value === 'string'
              ? [value]
              : Array.isArray(value)
              ? value.filter((item): item is string => typeof item === 'string')
              : [];
          })
      );
      const questions: Record<string, unknown>[] = [];
      const references: SurveyReference[] = [];
      for (const survey of parsedSurveys) {
        const matches = (Array.isArray(survey.questions) ? survey.questions : [])
          .map(asObject)
          .filter(
            (question): question is Record<string, unknown> =>
              !!question && asObject(question.memberFieldBinding)?.fieldId === field.id
          );
        if (matches.length) {
          references.push(surveyReference(survey));
          questions.push(...matches);
        }
      }
      const options = field.options.map((option) => {
        const usedBySurvey = questions.some(
          (question) =>
            question.type === 'member-field' ||
            (Array.isArray(question.data) ? question.data : []).some((raw) => {
              const entry = asObject(raw);
              return entry && (entry.value ?? entry.title) === option.id;
            })
        );
        const reason = usedOptions.has(option.id)
          ? ('member-values' as const)
          : usedBySurvey
          ? ('survey-binding' as const)
          : null;
        return { id: option.id, canRemove: !reason, reason };
      });
      return [
        field.id,
        {
          valueCount,
          surveys: references,
          options,
          canChangeType: !field.presetKey && !valueCount && !references.length,
          canDelete: !field.presetKey && !valueCount && !references.length,
          canDisable: !references.length,
        },
      ];
    })
  );
};
export const readFields = async (manager: EntityManager = AppDataSource.manager) => {
  const fields = await new MemberConfigurationRepository(manager).listFields();
  const editing = await readFieldEditing(fields, manager);
  return {
    items: fields.map((field) => ({ ...field, editing: editing.get(field.id)! })),
    capabilities: { fieldEditingDetails: true, ordering: true },
    orderRevision: orderRevision(fields),
  };
};
