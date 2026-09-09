import { randomUUID } from 'crypto';
import {
  AppDataSource,
  MemberConfigurationRepository,
  MemberDataRepository,
  MemberIdentity,
  MemberSubIdentity,
  MemberField,
  MemberForm,
  MemberMenuSyncRepository,
  Survey,
} from '@chihhaocooly/chihhao-package';
import { EntityManager } from 'typeorm';
import { MyError } from '../../@types/my-error';
import { booleanInput, integerInput, nullableId, objectInput, parseField, textInput } from './memberInput';
import { trySyncSubIdentityMenus } from './memberMenuWorker';
import { memberTransaction } from './memberTransaction';

export const requireSubIdentity = async (manager: EntityManager, id: string): Promise<MemberSubIdentity> => {
  const repository = new MemberConfigurationRepository(manager);
  const sub = await repository.findSubIdentity(id);
  const parent = sub && (await repository.findIdentity(sub.identityId));
  if (!sub || !parent) throw new MyError(404, '找不到子身份');
  if (!sub.isEnabled || !parent.isEnabled) throw new MyError(409, '身份已停用，請選擇其他身份');
  return sub;
};

export const validateMemberMenu = async (manager: EntityManager, key: string | null): Promise<void> => {
  if (key === null) return;
  const rows = (await manager.query(
    'SELECT status, type, enable, imageUrl, assetKey, lineRchmenuId FROM richmenu WHERE richmenuKey = ? FOR UPDATE',
    [key]
  )) as Array<{ status: string; type: string; enable: boolean; imageUrl: string; assetKey: string; lineRchmenuId: string }>;
  const menu = rows[0];
  if (
    !menu ||
    menu.status !== 'published' ||
    !menu.lineRchmenuId ||
    menu.type !== 'general' ||
    !menu.enable ||
    (!menu.imageUrl && !menu.assetKey)
  ) {
    throw new MyError(400, '請選擇已發布、啟用且有圖片的一般圖文選單');
  }
};

export class MemberConfigurationService {
  async identities() {
    const repo = new MemberConfigurationRepository();
    const [parents, children] = await Promise.all([repo.listIdentities(), repo.listSubIdentities()]);
    const counts = (await AppDataSource.query(
      'SELECT member.subIdentityId, sync.status, COUNT(*) AS total FROM member_menu_sync sync INNER JOIN line_member member ON member.id = sync.memberId WHERE member.subIdentityId IS NOT NULL GROUP BY member.subIdentityId, sync.status'
    )) as { subIdentityId: string; status: string; total: number | string }[];
    return {
      items: parents.map((parent) => ({
        ...parent,
        children: children
          .filter((child) => child.identityId === parent.id)
          .map((child) => ({
            ...child,
            syncSummary: Object.fromEntries(
              counts.filter((row) => row.subIdentityId === child.id).map((row) => [row.status, Number(row.total)])
            ),
          })),
      })),
    };
  }
  async fields() {
    return { items: await new MemberConfigurationRepository().listFields() };
  }
  async forms() {
    const repo = new MemberConfigurationRepository();
    const [items, settings] = await Promise.all([repo.listForms(), repo.getSettings()]);
    return { items, defaultSurveyKey: settings?.defaultSurveyKey ?? null };
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
      if (!isEnabled) {
        const children = await repo.listSubIdentities(current.id);
        const forms = await repo.listForms();
        if (forms.some((form) => form.isEnabled && children.some((child) => (child.id === form.targetSubIdentityId || form.allowedSourceSubIdentityIds.includes(child.id)))))
          throw new MyError(409, '請先調整使用此身份的會員問卷');
      }
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
      if (
        !isEnabled &&
        (await repo.listForms()).some((form) => form.isEnabled && (form.targetSubIdentityId === current.id || form.allowedSourceSubIdentityIds.includes(current.id)))
      )
        throw new MyError(409, '請先調整使用此子身份的會員問卷');
      const menuChanged = current.richmenuKey !== richmenuKey;
      Object.assign(current, {
        name: textInput(data.name, '子身份名稱'),
        isEnabled,
        sortOrder: integerInput(data.sortOrder, '排序'),
        richmenuKey,
      });
      const item = await repo.saveSubIdentity(current);
      if (menuChanged) {
        syncSubIdentityId = current.id;
        const sync = new MemberMenuSyncRepository(manager);
        let cursor: string | null = '';
        while (cursor !== null) cursor = await sync.queueForSubIdentity(current.id, richmenuKey, cursor);
      }
      return { item };
    });
    if (syncSubIdentityId) await trySyncSubIdentityMenus(syncSubIdentityId);
    return result;
  }
  async deleteIdentity(id: string, isSub: boolean): Promise<void> {
    await memberTransaction(async (manager) => {
      const repo = new MemberConfigurationRepository(manager);
      if (isSub) {
        if (!(await repo.findSubIdentity(id))) throw new MyError(404, '找不到子身份');
        const refs = await repo.findSubIdentityReferences(id);
        if (refs.memberCount || refs.surveyKeys.length) throw new MyError(409, '此子身份仍被會員或問卷引用');
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
      const item = parseField(input, current);
      const refs = await repo.findFieldReferences(current.id);
      if (refs.valueCount || refs.surveyKeys.length) {
        if (item.type !== current.type) throw new MyError(409, '已使用的欄位不可更改類型，請建立新欄位');
        if (
          current.options.some(
            (old) => !item.options.some((option) => option.id === old.id)
          )
        )
          throw new MyError(409, '已使用的選項請保留代碼，可重新命名或停用');
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
      const targetSubIdentityId = textInput(data.targetSubIdentityId, '目標子身份', 36);
      await requireSubIdentity(manager, targetSubIdentityId);
      if (!Array.isArray(data.allowedSourceSubIdentityIds) || data.allowedSourceSubIdentityIds.length > 200)
        throw new MyError(400, '請設定有效的來源身份清單');
      const allowedSourceSubIdentityIds = [...new Set(data.allowedSourceSubIdentityIds.map(nullableId))];
      for (const source of allowedSourceSubIdentityIds)
        if (source && !(await repo.findSubIdentity(source))) throw new MyError(400, '來源子身份不存在');
      const isEnabled = booleanInput(data.isEnabled);
      if (!isEnabled && (await repo.getSettings())?.defaultSurveyKey === surveyKey)
        throw new MyError(409, '請先更換預設會員問卷');
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
        if (!survey.enable || !form?.isEnabled) throw new MyError(400, '預設問卷必須已啟用會員問卷設定');
        await requireSubIdentity(manager, form.targetSubIdentityId);
      }
      await repo.setDefaultSurvey(surveyKey);
      return { defaultSurveyKey: surveyKey };
    });
  }
}
