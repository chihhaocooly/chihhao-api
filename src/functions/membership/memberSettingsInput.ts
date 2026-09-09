import { MemberIdentity, MemberSubIdentity } from '@chihhaocooly/chihhao-package';
import { MyError } from '../../@types/my-error';
import { atSettingsPath } from '../../@types/member-settings-error';
import { booleanInput, nullableId, objectInput, requestHash, textInput } from './memberInput';
import { IdentityGroupInput } from './memberSettingsTypes';

export const MAX_SUB_IDENTITIES = 200;
export const uuidInput = (value: unknown): string => {
  const id = textInput(value, '識別碼', 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new MyError(400, '識別碼必須是 UUID');
  return id.toLowerCase();
};
export const allowedSettingsInput = (input: unknown, keys: string[]): Record<string, unknown> => {
  const data = objectInput(input);
  // auth middleware 可能附加 uid；它永遠不成為設定資料。
  if (Object.keys(data).some((key) => key !== 'uid' && !keys.includes(key)))
    throw new MyError(400, '包含不支援的設定欄位');
  return Object.fromEntries(
    keys.filter((key) => Object.prototype.hasOwnProperty.call(data, key)).map((key) => [key, data[key]])
  );
};
export const parseIdentityGroup = async (input: unknown): Promise<IdentityGroupInput> => {
  const data = allowedSettingsInput(input, [
    'expectedRevision',
    'name',
    'isEnabled',
    'children',
    'deletedSubIdentityIds',
  ]);
  if (
    !Array.isArray(data.children) ||
    data.children.length > MAX_SUB_IDENTITIES ||
    !Array.isArray(data.deletedSubIdentityIds) ||
    data.deletedSubIdentityIds.length > MAX_SUB_IDENTITIES
  )
    throw new MyError(400, `每組最多 ${MAX_SUB_IDENTITIES} 個子身份`);
  const children: IdentityGroupInput['children'] = [];
  for (const raw of data.children) {
    const child = allowedSettingsInput(raw, ['id', 'name', 'isEnabled', 'richmenuKey']);
    const id = uuidInput(child.id);
    children.push({
      id,
      name: await atSettingsPath(`children.${id}.name`, () => textInput(child.name, '子身份名稱')),
      isEnabled: await atSettingsPath(`children.${id}.isEnabled`, () => booleanInput(child.isEnabled)),
      richmenuKey: await atSettingsPath(`children.${id}.richmenuKey`, () => nullableId(child.richmenuKey)),
    });
  }
  const deletedSubIdentityIds = data.deletedSubIdentityIds.map(uuidInput);
  const ids = [...children.map((child) => child.id), ...deletedSubIdentityIds];
  if (new Set(ids).size !== ids.length) throw new MyError(400, '子身份不能重複或同時保留與刪除');
  return {
    expectedRevision: data.expectedRevision === null ? null : textInput(data.expectedRevision, '設定版本', 64),
    name: await atSettingsPath('name', () => textInput(data.name, '身份名稱')),
    isEnabled: await atSettingsPath('isEnabled', () => booleanInput(data.isEnabled)),
    children,
    deletedSubIdentityIds,
  };
};
const timestamp = (value: Date | undefined): string | null => (value ? new Date(value).toISOString() : null);
export const groupRevision = (parent: MemberIdentity, children: MemberSubIdentity[]): string =>
  requestHash({
    parent: {
      id: parent.id,
      name: parent.name,
      isEnabled: parent.isEnabled,
      sortOrder: parent.sortOrder,
      updatedAt: timestamp(parent.updatedAt),
    },
    children: [...children]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((child) => ({
        id: child.id,
        name: child.name,
        isEnabled: child.isEnabled,
        richmenuKey: child.richmenuKey,
        sortOrder: child.sortOrder,
        updatedAt: timestamp(child.updatedAt),
      })),
  });
export const orderRevision = (items: { id: string; sortOrder: number }[]): string =>
  requestHash(items.map((item) => ({ id: item.id, sortOrder: item.sortOrder })));
