import { createHash } from 'crypto';
import { memberFieldTypes, MemberField, MemberFieldOption } from '@chihhaocooly/chihhao-package';
import { MyError } from '../../@types/my-error';

export const objectInput = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MyError(400, '請提供有效的資料物件');
  return value as Record<string, unknown>;
};
export const textInput = (value: unknown, label: string, max = 100): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new MyError(400, `${label}格式不正確`);
  return value.trim();
};
export const booleanInput = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new MyError(400, '啟用狀態必須是布林值');
  return value;
};
export const integerInput = (value: unknown, label = '版本', max = 2147483647): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max)
    throw new MyError(400, `${label}格式不正確`);
  return value;
};
export const nullableId = (value: unknown): string | null => (value === null ? null : textInput(value, '識別碼', 36));
export const operationInput = (value: unknown) => {
  const data = objectInput(value);
  return {
    data,
    expectedVersion: integerInput(data.expectedVersion),
    requestId: textInput(data.requestId, '操作識別碼', 80),
  };
};
// 排序物件 key，避免相同 JSON 僅因屬性順序不同而被判定成另一個操作。
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)])
      )
    : value;
export const requestHash = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');

export const parseField = (input: unknown, current: MemberField): MemberField => {
  const data = { ...current, ...objectInput(input) };
  const type = textInput(data.type, '欄位類型', 30);
  if (!memberFieldTypes.includes(type as MemberField['type'])) throw new MyError(400, '不支援此欄位類型');
  if (current.presetKey && type !== current.type) throw new MyError(409, '預設欄位不可更改類型');
  const options: MemberFieldOption[] = [];
  if (!Array.isArray(data.options) || data.options.length > 100) throw new MyError(400, '選項最多 100 個');
  for (const raw of data.options) {
    const option = objectInput(raw);
    options.push({
      id: textInput(option.id, '選項代碼', 80),
      label: textInput(option.label, '選項名稱'),
      isEnabled: booleanInput(option.isEnabled),
    });
  }
  if (new Set(options.map((option) => option.id)).size !== options.length) throw new MyError(400, '選項代碼不可重複');
  if (['single-select', 'multi-select'].includes(type) && !options.length) throw new MyError(400, '請至少建立一個選項');
  const validation = objectInput(data.validation);
  for (const key of Object.keys(validation)) {
    if (!['maxLength', 'min', 'max', 'disallowFuture'].includes(key)) throw new MyError(400, '不支援此驗證規則');
    if (key === 'disallowFuture') booleanInput(validation[key]);
    else if (typeof validation[key] !== 'number' || !Number.isFinite(validation[key]))
      throw new MyError(400, '驗證範圍必須是有效數字');
  }
  if (validation.maxLength !== undefined && integerInput(validation.maxLength, '字數上限', 10000) < 1)
    throw new MyError(400, '字數上限至少為 1');
  if (typeof validation.min === 'number' && typeof validation.max === 'number' && validation.min > validation.max)
    throw new MyError(400, '最小值不可大於最大值');
  return Object.assign(new MemberField(), current, {
    label: textInput(data.label, '欄位名稱'),
    type,
    isEnabled: booleanInput(data.isEnabled),
    sortOrder: integerInput(data.sortOrder, '排序'),
    options,
    validation,
  });
};
