import { getPrimaryLiffUrls } from '../siteSettings/primaryLiffUrls';
import { randomUUID } from 'crypto';
import {
  AppDataSource,
  MemberConfigurationRepository,
  MemberDataRepository,
  MemberIdentity,
  MemberSubIdentity,
  MemberField,
  MemberForm,
  Survey,
} from '@chihhaocooly/chihhao-package';
import { EntityManager } from 'typeorm';
import { MyError } from '../../@types/my-error';
import { booleanInput, integerInput, nullableId, objectInput, parseField, textInput } from './memberInput';
import { trySyncSubIdentityMenus } from './memberMenuWorker';
import { memberTransaction } from './memberTransaction';
import { readFields, readFieldEditing, readIdentities } from './memberSettingsRead';
import { assertCanDeleteSub, assertCanDisable, saveSubAndQueue, validateMemberMenu } from './memberIdentityRules';
import { allowedSettingsInput } from './memberSettingsInput';
import { MemberSettingsError } from '../../@types/member-settings-error';
export { validateMemberMenu } from './memberIdentityRules';

export const requireSubIdentity = async (manager: EntityManager, id: string): Promise<MemberSubIdentity> => {
  const repository = new MemberConfigurationRepository(manager);
  const sub = await repository.findSubIdentity(id);
  const parent = sub && (await repository.findIdentity(sub.identityId));
  if (!sub || !parent) throw new MyError(404, '找不到子身份');
  if (!sub.isEnabled || !parent.isEnabled) throw new MyError(409, '身份已停用，請選擇其他身份');
  return sub;
};

const optionalTransitionsReady = async (manager: EntityManager = AppDataSource.manager): Promise<boolean> => {
  const columns = (await manager.query(
    "SELECT IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_form' AND COLUMN_NAME = 'targetSubIdentityId'"
  )) as { nullable: string }[];
  return columns[0]?.nullable === 'YES';
};

export class MemberConfigurationService {
  async identities() {
    return memberTransaction((manager) => readIdentities(manager));
  }
  async fields() {
    return memberTransaction((manager) => readFields(manager));
  }
  async field(id: string) {
    return memberTransaction(async (manager) => {
      const item = await new MemberConfigurationRepository(manager).findField(id);
      if (!item) throw new MyError(404, '找不到會員欄位');
      return { item, editing: (await readFieldEditing([item], manager)).get(id)! };
    });
  }
  async forms(): Promise<{
    items: MemberForm[];
    defaultSurveyKey: string | null;
    defaultEntryUrl: string | null;
    capabilities: { optionalIdentityTransition: boolean };
  }> {
    const repo = new MemberConfigurationRepository();
    const [items, settings, urls, ready] = await Promise.all([
      repo.listForms(),
      repo.getSettings(),
      getPrimaryLiffUrls(),
      optionalTransitionsReady(),
    ]);
    return {
      items,
      defaultSurveyKey: settings?.defaultSurveyKey ?? null,
      defaultEntryUrl: urls?.member ?? null,
      capabilities: { optionalIdentityTransition: ready },
    };
  }
  async saveIdentity(id: string | null, input: unknown) {
    return memberTransaction(async (manager) => {
      const repo = new MemberConfigurationRepository(manager);
      const current = id
        ? await repo.findIdentity(id)
        : Object.assign(new MemberIdentity(), { id: randomUUID(), isEnabled: true, sortOrder: 0 });
      if (!current) throw new MyError(404, '找不到身份');
      const data = { ...current, ...objectInput(input) };
      const isEnabled = booleanInput(data.isEnabled);
      if (!isEnabled)
        await assertCanDisable(
          manager,
          (await repo.listSubIdentities(current.id)).map((child) => child.id)
        );
      Object.assign(current, {
        name: textInput(data.name, '身份名稱'),
        isEnabled,
        sortOrder: integerInput(data.sortOrder, '排序'),
      });
      return { item: await repo.saveIdentity(current) };
    });
  }
  async saveSubIdentity(identityId: string | null, id: string | null, input: unknown) {
    let syncSubIdentityId: string | null = null;
    const result = await memberTransaction(async (manager) => {
      const repo = new MemberConfigurationRepository(manager);
      const current = id
        ? await repo.findSubIdentity(id)
        : Object.assign(new MemberSubIdentity(), {
            id: randomUUID(),
            identityId,
            isEnabled: true,
            sortOrder: 0,
            richmenuKey: null,
          });
      if (!current || !(await repo.findIdentity(current.identityId))) throw new MyError(404, '找不到身份');
      const data = { ...current, ...objectInput(input) };
      const richmenuKey = nullableId(data.richmenuKey);
      await validateMemberMenu(manager, richmenuKey);
      const isEnabled = booleanInput(data.isEnabled);
      if (!isEnabled) await assertCanDisable(manager, [current.id]);
      const oldMenu = current.richmenuKey;
      Object.assign(current, {
        name: textInput(data.name, '子身份名稱'),
        isEnabled,
        sortOrder: integerInput(data.sortOrder, '排序'),
        richmenuKey,
      });
      if (await saveSubAndQueue(manager, current, oldMenu)) syncSubIdentityId = current.id;
      return { item: current };
    });
    if (syncSubIdentityId) await trySyncSubIdentityMenus(syncSubIdentityId);
    return result;
  }
  async deleteIdentity(id: string, isSub: boolean): Promise<void> {
    await memberTransaction(async (manager) => {
      const repo = new MemberConfigurationRepository(manager);
      if (isSub) {
        if (!(await repo.findSubIdentity(id))) throw new MyError(404, '找不到子身份');
        await assertCanDeleteSub(manager, id);
        await repo.deleteSubIdentity(id);
        return;
      }
      if (!(await repo.findIdentity(id))) throw new MyError(404, '找不到身份');
      if ((await repo.listSubIdentities(id)).length) throw new MyError(409, '請先刪除身份下的子身份');
      await repo.deleteIdentity(id);
    });
  }
  async saveField(id: string | null, input: unknown) {
    return memberTransaction(async (manager) => {
      const repo = new MemberConfigurationRepository(manager);
      const current = id
        ? await repo.findField(id)
        : Object.assign(new MemberField(), {
            id: randomUUID(),
            presetKey: null,
            isEnabled: true,
            sortOrder: 0,
            options: [],
            validation: {},
          });
      if (!current) throw new MyError(404, '找不到會員欄位');
      const data = allowedSettingsInput(input, ['label', 'type', 'isEnabled', 'sortOrder', 'options', 'validation']);
      if (!id && data.sortOrder === undefined)
        current.sortOrder = Math.max(-1, ...(await repo.listFields()).map((field) => field.sortOrder)) + 1;
      const item = parseField(data, current);
      const refs = await repo.findFieldReferences(current.id);
      if (refs.valueCount || refs.surveyKeys.length) {
        if (item.type !== current.type) throw new MyError(409, '已使用的欄位不可更改類型，請建立新欄位');
      }
      if (current.options.some((old) => !item.options.some((option) => option.id === old.id))) {
        const editing = (await readFieldEditing([current], manager)).get(current.id)!;
        const blocked = editing.options.filter(
          (option) => !option.canRemove && !item.options.some((next) => next.id === option.id)
        );
        if (blocked.length)
          throw new MemberSettingsError(
            409,
            '已使用的選項請保留，可重新命名或停用',
            blocked.map((option) => ({ path: `options.${option.id}.label`, message: '此選項仍被會員或問卷引用' }))
          );
      }
      if (!item.isEnabled && refs.surveyKeys.length) throw new MyError(409, '請先移除問卷中的欄位綁定');
      const saved = await repo.saveField(item);
      for (const surveyKey of refs.surveyKeys) await manager.increment(Survey, { surveyKey }, 'version', 1);
      return { item: saved };
    });
  }
  async deleteField(id: string): Promise<void> {
    await memberTransaction(async (manager) => {
      const repo = new MemberConfigurationRepository(manager);
      const field = await repo.findField(id);
      if (!field) throw new MyError(404, '找不到會員欄位');
      const refs = await repo.findFieldReferences(id);
      if (field.presetKey || refs.valueCount || refs.surveyKeys.length)
        throw new MyError(409, '預設欄位或已使用的欄位不可刪除');
      await repo.deleteField(id);
    });
  }
  async saveForm(surveyKey: string, input: unknown) {
    return memberTransaction(async (manager) => {
      const repo = new MemberConfigurationRepository(manager);
      await new MemberDataRepository(manager).lockSurvey(surveyKey);
      const data = objectInput(input);
      const createOnly = data.createOnly === undefined ? false : booleanInput(data.createOnly);
      if (createOnly && (await repo.findForm(surveyKey)))
        throw new MyError(409, '此問卷已設定會員規則，請編輯既有設定');
      const isEnabled = booleanInput(data.isEnabled);
      if (!Array.isArray(data.allowedSourceSubIdentityIds) || data.allowedSourceSubIdentityIds.length > 200)
        throw new MyError(400, '請設定有效的來源身份清單');
      const allowedSourceSubIdentityIds = isEnabled
        ? [...new Set(data.allowedSourceSubIdentityIds.map(nullableId))]
        : [];
      const targetSubIdentityId = isEnabled ? textInput(data.targetSubIdentityId, '目標子身份', 36) : null;
      if (targetSubIdentityId !== null) {
        if (!allowedSourceSubIdentityIds.length) throw new MyError(400, '請至少選擇一個來源身份');
        await requireSubIdentity(manager, targetSubIdentityId);
        for (const source of allowedSourceSubIdentityIds)
          if (source && !(await repo.findSubIdentity(source))) throw new MyError(400, '來源子身份不存在');
      } else {
        if (!(await optionalTransitionsReady(manager))) throw new MyError(503, '會員問卷功能尚未完成資料庫更新');
      }
      const item = await repo.saveForm(
        Object.assign(new MemberForm(), { surveyKey, targetSubIdentityId, allowedSourceSubIdentityIds, isEnabled })
      );
      await manager.increment(Survey, { surveyKey }, 'version', 1);
      return { item };
    });
  }
  async deleteForm(surveyKey: string): Promise<void> {
    await memberTransaction(async (manager) => {
      const repo = new MemberConfigurationRepository(manager);
      await new MemberDataRepository(manager).lockSurvey(surveyKey);
      if ((await repo.getSettings())?.defaultSurveyKey === surveyKey) throw new MyError(409, '請先更換預設會員問卷');
      await repo.deleteForm(surveyKey);
      await manager.increment(Survey, { surveyKey }, 'version', 1);
    });
  }
  async setDefault(input: unknown) {
    return memberTransaction(async (manager) => {
      const surveyKey = nullableId(objectInput(input).surveyKey);
      const repo = new MemberConfigurationRepository(manager);
      if (surveyKey) {
        const survey = await new MemberDataRepository(manager).lockSurvey(surveyKey);
        const form = await repo.findForm(surveyKey);
        if (!survey.enable || !form) throw new MyError(400, '請選擇已啟用且已設定的會員問卷');
        if (form.isEnabled && form.allowedSourceSubIdentityIds.length) {
          if (!form.targetSubIdentityId) throw new MyError(400, '會員問卷的目標身份尚未設定');
          await requireSubIdentity(manager, form.targetSubIdentityId);
        }
      }
      await repo.setDefaultSurvey(surveyKey);
      return { defaultSurveyKey: surveyKey };
    });
  }
}
