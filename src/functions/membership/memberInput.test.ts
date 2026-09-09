import { MemberField } from '@chihhaocooly/chihhao-package';
import { parseField, requestHash, integerInput, objectInput } from './memberInput';
import { memberValidationContext, taiwanRegions } from './memberRegions';
import { normalizeMemberFieldValue } from '@chihhaocooly/chihhao-package';

const field = () =>
  Object.assign(new MemberField(), {
    id: 'test',
    presetKey: null,
    label: '水果',
    type: 'single-select',
    isEnabled: true,
    sortOrder: 0,
    options: [{ id: 'apple', label: '蘋果', isEnabled: true }],
    validation: {},
  });
describe('會員設定輸入與台灣資料', () => {
  test('固定選項代碼不可重複，驗證範圍不可顛倒', () => {
    expect(() => parseField({ options: [...field().options, ...field().options] }, field())).toThrow('不可重複');
    expect(() => parseField({ validation: { min: 5, max: 2 } }, field())).toThrow('最小值');
    expect(() => parseField({ isEnabled: 'false' }, field())).toThrow('布林');
    expect(() => parseField({ type: 'html' }, field())).toThrow('類型');
  });
  test('預設欄位保護、未知驗證規則拒絕', () => {
    expect(() => parseField({ type: 'number' }, Object.assign(field(), { presetKey: 'gender' }))).toThrow('預設欄位');
    expect(() => parseField({ validation: { script: 'x' } }, field())).toThrow('驗證規則');
  });
  test('防重送雜湊忽略物件 key 順序，但保留值與陣列順序', () => {
    expect(requestHash({ a: 1, b: { c: 2, d: false } })).toBe(requestHash({ b: { d: false, c: 2 }, a: 1 }));
    expect(requestHash([1, 2])).not.toBe(requestHash([2, 1]));
  });
  test('拒絕無效版本與非物件輸入', () => {
    for (const value of [-1, 1.5, '1', Infinity]) expect(() => integerInput(value)).toThrow();
    expect(() => objectInput([])).toThrow();
  });
  test('22 縣市、368 鄉鎮市區，地址名稱由受信任資料正規化', () => {
    expect(taiwanRegions.cities).toHaveLength(22);
    expect(taiwanRegions.cities.reduce((count, city) => count + city.districts.length, 0)).toBe(368);
    const addressField = { ...field(), type: 'taiwan-address' as const };
    const input = {
      cityCode: '63000',
      districtCode: '63000010',
      cityName: '錯誤縣市',
      districtName: '錯誤行政區',
      addressLine: '民生東路 1 號',
      postalCode: '105',
    };
    expect(normalizeMemberFieldValue(addressField, input, memberValidationContext())).toMatchObject({
      cityName: '臺北市',
      districtName: '松山區',
    });
    expect(() =>
      normalizeMemberFieldValue(addressField, { ...input, cityCode: '65000' }, memberValidationContext())
    ).toThrow();
  });
});
