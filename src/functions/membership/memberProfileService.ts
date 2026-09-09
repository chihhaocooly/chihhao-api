import {
  AppDataSource,
  LineMember,
  MemberChange,
  MemberConfigurationRepository,
  MemberDataRepository,
  MemberMenuSync,
  MemberMenuSyncRepository,
  normalizeMemberFieldValue,
  MemberFieldValueData,
} from '@chihhaocooly/chihhao-package';
import { EntityManager } from 'typeorm';
import { MyError } from '../../@types/my-error';
import { nullableId, objectInput, operationInput, requestHash, textInput } from './memberInput';
import { memberTransaction } from './memberTransaction';
import { requireSubIdentity } from './memberConfigurationService';
import { trySyncMemberMenu } from './memberMenuWorker';
import { memberValidationContext } from './memberRegions';

export const identitySnapshot = async (manager: EntityManager, id: string | null) => {
  const repo = new MemberConfigurationRepository(manager);
  const sub = id ? await repo.findSubIdentity(id) : null;
  const parent = sub ? await repo.findIdentity(sub.identityId) : null;
  return {
    subIdentityId: id,
    subIdentityName: sub?.name ?? null,
    identityId: parent?.id ?? null,
    identityName: parent?.name ?? null,
  };
};

export class MemberProfileService {
  async detail(memberId: string) {
    const member = await AppDataSource.manager.findOneBy(LineMember, { id: memberId });
    if (!member) throw new MyError(404, '找不到會員');
    const [membership, fields, values, menuSync] = await Promise.all([
      identitySnapshot(AppDataSource.manager, member.subIdentityId),
      new MemberConfigurationRepository().listFields(),
      new MemberDataRepository().listValues(memberId),
      AppDataSource.manager.findOneBy(MemberMenuSync, { memberId }),
    ]);
    return {
      membership: { ...membership, version: member.membershipVersion },
      profile: fields
        .filter((field) => field.isEnabled || values.some((value) => value.fieldId === field.id))
        .map((field) => ({ field, value: values.find((value) => value.fieldId === field.id)?.value ?? null })),
      menuSync: menuSync
        ? {
            status: menuSync.status,
            attemptCount: menuSync.attemptCount,
            lastErrorCode: menuSync.lastErrorCode,
            updatedAt: menuSync.updatedAt,
          }
        : null,
    };
  }
  async transition(memberId: string, input: unknown, actorId: string) {
    const { data, expectedVersion, requestId } = operationInput(input);
    const subIdentityId = nullableId(data.subIdentityId);
    const reason = data.reason === undefined || data.reason === '' ? null : textInput(data.reason, '原因', 500);
    const hash = requestHash({ subIdentityId, expectedVersion, reason });
    let shouldSync = false;
    const result = await memberTransaction(async (manager) => {
      const repo = new MemberDataRepository(manager);
      const member = await repo.lockMember(memberId);
      const previous = await repo.findOperation(memberId, requestId, 'identity', hash);
      if (previous) return previous.result;
      if (member.membershipVersion !== expectedVersion) throw new MyError(409, '會員資料已更新，請重新載入');
      const target = subIdentityId ? await requireSubIdentity(manager, subIdentityId) : null;
      const changed = member.subIdentityId !== subIdentityId;
      let version = member.membershipVersion;
      if (changed) {
        version = await repo.updateMembership(memberId, expectedVersion, subIdentityId);
        await repo.appendChange(
          Object.assign(new MemberChange(), {
            memberId,
            kind: 'identity',
            source: 'admin',
            actorId,
            reason,
            before: await identitySnapshot(manager, member.subIdentityId),
            after: await identitySnapshot(manager, subIdentityId),
          })
        );
        await new MemberMenuSyncRepository(manager).queue(memberId, target?.richmenuKey ?? null);
        shouldSync = true;
      }
      const sync = await manager.findOneBy(MemberMenuSync, { memberId });
      const result = {
        changed,
        previousSubIdentityId: member.subIdentityId,
        subIdentityId,
        membershipVersion: version,
        menuSyncStatus: sync?.status ?? null,
      };
      await repo.completeOperation(memberId, requestId, 'identity', hash, result);
      return result;
    });
    if (shouldSync) await trySyncMemberMenu(memberId);
    return result;
  }
  async updateProfile(memberId: string, input: unknown, actorId: string) {
    const { data, expectedVersion, requestId } = operationInput(input);
    if (!Array.isArray(data.values) || data.values.length > 200) throw new MyError(400, '會員欄位清單格式不正確');
    const inputs = data.values.map((value) => {
      const item = objectInput(value);
      return { fieldId: textInput(item.fieldId, '欄位代碼', 80), value: item.value };
    });
    if (new Set(inputs.map((item) => item.fieldId)).size !== inputs.length) throw new MyError(400, '會員欄位不可重複');
    const hash = requestHash({ expectedVersion, values: inputs });
    return memberTransaction(async (manager) => {
      const repo = new MemberDataRepository(manager);
      const member = await repo.lockMember(memberId);
      const previous = await repo.findOperation(memberId, requestId, 'profile', hash);
      if (previous) return previous.result;
      if (member.membershipVersion !== expectedVersion) throw new MyError(409, '會員資料已更新，請重新載入');
      const config = new MemberConfigurationRepository(manager);
      const current = await repo.listValues(memberId);
      const changes: {
        fieldId: string;
        label: string;
        before: MemberFieldValueData | null;
        after: MemberFieldValueData | null;
      }[] = [];
      for (const input of inputs) {
        const field = await config.findField(input.fieldId);
        if (!field) throw new MyError(400, '會員欄位不存在');
        if (!field.isEnabled) throw new MyError(409, '會員欄位已停用');
        const after =
          input.value === null ? null : normalizeMemberFieldValue(field, input.value, memberValidationContext());
        if (input.value !== null && after === null) continue;
        const before = current.find((item) => item.fieldId === input.fieldId)?.value ?? null;
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        await repo.saveValue(memberId, field.id, after);
        changes.push({ fieldId: field.id, label: field.label, before, after });
      }
      let version = member.membershipVersion;
      if (changes.length) {
        version = await repo.updateMembership(memberId, expectedVersion, member.subIdentityId);
        await repo.appendChange(
          Object.assign(new MemberChange(), {
            memberId,
            kind: 'profile',
            source: 'admin',
            actorId,
            before: {
              values: changes.map((item) => ({ fieldId: item.fieldId, label: item.label, value: item.before })),
            },
            after: { values: changes.map((item) => ({ fieldId: item.fieldId, label: item.label, value: item.after })) },
          })
        );
      }
      const result = { changed: changes.length > 0, membershipVersion: version };
      await repo.completeOperation(memberId, requestId, 'profile', hash, result);
      return result;
    });
  }
  async history(memberId: string, kind: 'changes' | 'survey-reports', page = 1, pageSize = 20) {
    const member = await AppDataSource.manager.findOneBy(LineMember, { id: memberId });
    if (!member) throw new MyError(404, '找不到會員');
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
      throw new MyError(400, '分頁格式不正確');
    const repo = new MemberDataRepository();
    const [items, total] =
      kind === 'changes'
        ? await repo.listChanges(memberId, page, pageSize)
        : await repo.listSurveyReports(member.lineUserId, page, pageSize);
    return { items, total, page, pageSize };
  }
  async retry(memberId: string) {
    await memberTransaction(async (manager) => {
      const member = await new MemberDataRepository(manager).lockMember(memberId);
      const sub = member.subIdentityId
        ? await new MemberConfigurationRepository(manager).findSubIdentity(member.subIdentityId)
        : null;
      await new MemberMenuSyncRepository(manager).queue(memberId, sub?.richmenuKey ?? null);
    });
    return { menuSyncStatus: await trySyncMemberMenu(memberId) };
  }
}
