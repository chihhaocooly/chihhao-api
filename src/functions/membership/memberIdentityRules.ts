import {
  MemberConfigurationRepository,
  MemberMenuSyncRepository,
  MemberSubIdentity,
} from '@chihhaocooly/chihhao-package';
import { EntityManager } from 'typeorm';
import { MyError } from '../../@types/my-error';
import { formUsesSub } from './memberSettingsRead';

export const validateMemberMenu = async (manager: EntityManager, key: string | null): Promise<void> => {
  if (key === null) return;
  const rows = (await manager.query(
    'SELECT status, type, enable, imageUrl, assetKey, lineRchmenuId FROM richmenu WHERE richmenuKey = ? FOR UPDATE',
    [key]
  )) as { status: string; type: string; enable: boolean; imageUrl: string; assetKey: string; lineRchmenuId: string }[];
  const menu = rows[0];
  if (
    !menu ||
    menu.status !== 'published' ||
    !menu.lineRchmenuId ||
    menu.type !== 'general' ||
    !menu.enable ||
    (!menu.imageUrl && !menu.assetKey)
  )
    throw new MyError(400, '請選擇已發布、啟用且有圖片的一般圖文選單');
};
export const assertCanDisable = async (manager: EntityManager, ids: string[]): Promise<void> => {
  const forms = await new MemberConfigurationRepository(manager).listForms();
  if (forms.some((form) => form.isEnabled && ids.some((id) => formUsesSub(form, id))))
    throw new MyError(409, '請先調整使用此身份的會員問卷');
};
export const assertCanDeleteSub = async (manager: EntityManager, id: string): Promise<void> => {
  const refs = await new MemberConfigurationRepository(manager).findSubIdentityReferences(id);
  if (refs.memberCount || refs.surveyKeys.length) throw new MyError(409, '此子身份仍被會員或問卷引用');
};
export const saveSubAndQueue = async (
  manager: EntityManager,
  child: MemberSubIdentity,
  oldMenu: string | null
): Promise<boolean> => {
  await new MemberConfigurationRepository(manager).saveSubIdentity(child);
  if (oldMenu === child.richmenuKey) return false;
  const sync = new MemberMenuSyncRepository(manager);
  let cursor: string | null = '';
  while (cursor !== null) cursor = await sync.queueForSubIdentity(child.id, child.richmenuKey, cursor);
  return true;
};
