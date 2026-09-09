import { MemberConfigurationRepository, MemberIdentity, MemberSubIdentity } from '@chihhaocooly/chihhao-package';
import { MyError } from '../../@types/my-error';
import { atSettingsPath } from '../../@types/member-settings-error';
import { memberTransaction } from './memberTransaction';
import {
  allowedSettingsInput,
  groupRevision,
  orderRevision,
  parseIdentityGroup,
  uuidInput,
} from './memberSettingsInput';
import { readIdentityGroup } from './memberSettingsRead';
import { assertCanDeleteSub, assertCanDisable, saveSubAndQueue, validateMemberMenu } from './memberIdentityRules';
import { trySyncIdentityGroupMenus } from './memberMenuWorker';
import { IdentityGroupResponse } from './memberSettingsTypes';

export class MemberIdentityGroupService {
  get(id: string): Promise<IdentityGroupResponse> {
    return memberTransaction((manager) => readIdentityGroup(uuidInput(id), manager));
  }
  async save(rawId: string, input: unknown): Promise<IdentityGroupResponse & { created: boolean }> {
    const id = uuidInput(rawId);
    const data = await parseIdentityGroup(input);
    const changed: string[] = [];
    const saved = await memberTransaction(async (manager) => {
      const repo = new MemberConfigurationRepository(manager);
      const [parent, allChildren, parents] = await Promise.all([
        repo.findIdentity(id),
        repo.listSubIdentities(),
        repo.listIdentities(),
      ]);
      const children = allChildren.filter((child) => child.identityId === id);
      if (data.expectedRevision === null && parent) throw new MyError(409, '此身份已建立，請重新載入確認');
      if (data.expectedRevision !== null && !parent) throw new MyError(404, '找不到身份');
      if (parent && groupRevision(parent, children) !== data.expectedRevision)
        throw new MyError(409, '設定已被更新，請重新載入確認');
      const kept = new Set(data.children.map((child) => child.id));
      const deleted = new Set(data.deletedSubIdentityIds);
      if (
        children.some((child) => !kept.has(child.id) && !deleted.has(child.id)) ||
        data.deletedSubIdentityIds.some((childId) => !children.some((child) => child.id === childId))
      )
        throw new MyError(400, '請明確指定要刪除的既有子身份');
      for (const child of data.children) {
        if (allChildren.some((existing) => existing.id === child.id && existing.identityId !== id))
          throw new MyError(400, '子身份不屬於目前主身份');
        await atSettingsPath(`children.${child.id}.richmenuKey`, () => validateMemberMenu(manager, child.richmenuKey));
        if (!child.isEnabled)
          await atSettingsPath(`children.${child.id}.isEnabled`, () => assertCanDisable(manager, [child.id]));
      }
      if (!data.isEnabled)
        await atSettingsPath('isEnabled', () =>
          assertCanDisable(
            manager,
            children.map((child) => child.id)
          )
        );
      for (const childId of deleted)
        await atSettingsPath(`children.${childId}`, () => assertCanDeleteSub(manager, childId));
      const item =
        parent ??
        Object.assign(new MemberIdentity(), { id, sortOrder: Math.max(-1, ...parents.map((p) => p.sortOrder)) + 1 });
      Object.assign(item, { name: data.name, isEnabled: data.isEnabled });
      await repo.saveIdentity(item);
      for (const [sortOrder, child] of data.children.entries()) {
        const existing = children.find((row) => row.id === child.id);
        const oldMenu = existing?.richmenuKey ?? null;
        const entity = Object.assign(existing ?? new MemberSubIdentity(), child, { identityId: id, sortOrder });
        if (await saveSubAndQueue(manager, entity, oldMenu)) changed.push(child.id);
      }
      for (const childId of deleted) await repo.deleteSubIdentity(childId);
      return { ...(await readIdentityGroup(id, manager)), created: !parent };
    });
    await trySyncIdentityGroupMenus(changed);
    // 交易已成功；後續讀取失敗不能把已提交的結果改成 HTTP 失敗。
    try {
      return { ...(await this.get(id)), created: saved.created };
    } catch {
      return saved;
    }
  }
  async reorder(
    kind: 'identities' | 'fields',
    input: unknown
  ): Promise<{ orderedIds: string[]; orderRevision: string }> {
    const data = allowedSettingsInput(input, ['orderedIds', 'expectedRevision']);
    if (!Array.isArray(data.orderedIds) || !data.orderedIds.every((id) => typeof id === 'string'))
      throw new MyError(400, '排序清單格式不正確');
    const orderedIds = data.orderedIds as string[];
    return memberTransaction(async (manager) => {
      const repo = new MemberConfigurationRepository(manager);
      const items = kind === 'identities' ? await repo.listIdentities() : await repo.listFields();
      if (orderRevision(items) !== data.expectedRevision) throw new MyError(409, '列表已更新，請重新載入後排序');
      if (
        orderedIds.length !== items.length ||
        new Set(orderedIds).size !== items.length ||
        orderedIds.some((id) => !items.some((item) => item.id === id))
      )
        throw new MyError(400, '排序必須包含完整且不重複的項目');
      const ordered = orderedIds.map((id) => items.find((item) => item.id === id)!);
      for (const [sortOrder, item] of ordered.entries()) {
        if (item.sortOrder === sortOrder) continue;
        item.sortOrder = sortOrder;
        if (kind === 'identities') await repo.saveIdentity(item as MemberIdentity);
        else await repo.saveField(item as import('@chihhaocooly/chihhao-package').MemberField);
      }
      return { orderedIds, orderRevision: orderRevision(ordered) };
    });
  }
}
