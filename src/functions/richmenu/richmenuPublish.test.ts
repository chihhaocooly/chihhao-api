import { AppDataSource, MemberConfigurationRepository } from '@chihhaocooly/chihhao-package';
import axios from 'axios';
import { EntityManager } from 'typeorm';
import { LineMessageApiService } from '../lineMessageApi/lineMessageApiService';
import { memberTransaction } from '../membership/memberTransaction';
import {
  createRichmenu,
  publishRichmenu,
  getPublishedMemberRichmenu,
  listRichmenus,
  toRichmenuDto,
  updateRichmenu,
} from './richmenuService';
import { RichmenuArea, RichmenuRow, SaveRichmenuRequest } from './richmenuTypes';

jest.mock('../projectAsset/projectAssetService', () => ({
  readProjectAsset: jest.fn(async () => ({ publicUrl: 'https://example.com/menu.jpg' })),
  replaceProjectAssetReferencesForEntity: jest.fn(),
}));
jest.mock('../projectAsset/projectAssetUsageProfiles', () => ({
  evaluateProjectAssetEligibility: () => ({ isEligible: true, reasons: [] }),
}));
jest.mock('../membership/memberTransaction', () => ({ memberTransaction: jest.fn() }));
jest.mock('sharp', () => ({
  __esModule: true,
  default: () => ({
    resize() {
      return this;
    },
    jpeg() {
      return this;
    },
    async toBuffer() {
      return Buffer.from('image');
    },
  }),
}));

const area = (type: string): RichmenuArea => ({
  x: 0,
  y: 0,
  width: 500,
  height: 500,
  action: { type, text: '查看進度', uri: 'https://example.com', title: '會員資料' },
});
describe('圖文選單發布至 LINE', () => {
  let row: RichmenuRow;
  beforeEach(() => {
    row = {
      richmenuKey: 'menu',
      name: '待驗證',
      chatBarText: '審核中',
      width: 1527,
      height: 1030,
      assetKey: 'asset',
      status: 'published',
      type: 'general',
      enable: true,
      selected: true,
      areas: [area('none')],
      imageUrl: 'https://example.com/menu.jpg',
      lineRchmenuId: '',
      isDefault: false,
      queryListKeywords: [],
      startDateTime: null,
      endDateTime: null,
      createdAt: null,
      updatedAt: null,
    };
    jest.spyOn(AppDataSource, 'query').mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT')) return [{ ...row }];
      return { affectedRows: 1 };
    });
    jest
      .mocked(memberTransaction)
      .mockImplementation(async (work) => work({ query: AppDataSource.query } as EntityManager));
    jest.spyOn(MemberConfigurationRepository.prototype, 'findRichmenuReferences').mockResolvedValue([]);
    jest.spyOn(axios, 'get').mockResolvedValue({ data: Buffer.from('source') });
    jest.spyOn(LineMessageApiService, 'CreateRichmenu').mockResolvedValue('line-menu');
    jest.spyOn(LineMessageApiService, 'SetRichmenuImage').mockResolvedValue({});
    jest.spyOn(LineMessageApiService, 'DeleteRichmenu').mockResolvedValue({});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });
  const payload = (status: 'draft' | 'published'): SaveRichmenuRequest => ({
    ...toRichmenuDto(row),
    assetKey: 'asset',
    status,
  });

  test('舊的無動作提示選單先建立與上傳，才寫入已發布', async () => {
    const item = await publishRichmenu('menu');
    expect(item.lineRchmenuId).toBe('line-menu');
    expect(item.status).toBe('published');
    expect(LineMessageApiService.CreateRichmenu).toHaveBeenCalledWith(expect.objectContaining({ areas: [] }));
    const uploadOrder = jest.mocked(LineMessageApiService.SetRichmenuImage).mock.invocationCallOrder[0];
    const updateIndex = jest.mocked(AppDataSource.query).mock.calls.findIndex(([sql]) => sql.startsWith('UPDATE'));
    expect(jest.mocked(AppDataSource.query).mock.invocationCallOrder[updateIndex]).toBeGreaterThan(uploadOrder);
  });
  test('略過無動作但保留文字與連結區塊', async () => {
    row.areas = [area('none'), area('message'), area('uri')];
    await publishRichmenu('menu');
    const sent = jest.mocked(LineMessageApiService.CreateRichmenu).mock.calls[0][0];
    expect(sent.areas.map((item) => item.action.type)).toEqual(['message', 'uri']);
    expect(sent.areas[0].bounds.width).toBe(819);
  });
  test('未知動作仍拒絕發布', async () => {
    row.areas = [area('unsupported')];
    await expect(publishRichmenu('menu')).rejects.toThrow('尚未設定 LINE 支援的動作');
    expect(LineMessageApiService.CreateRichmenu).not.toHaveBeenCalled();
  });
  test('草稿儲存完全不呼叫 LINE', async () => {
    await createRichmenu(payload('draft'));
    expect(LineMessageApiService.CreateRichmenu).not.toHaveBeenCalled();
    expect(LineMessageApiService.SetRichmenuImage).not.toHaveBeenCalled();
  });
  test('新建並發布時先上傳才 INSERT，儲存 LINE ID', async () => {
    await createRichmenu(payload('published'));
    const insert = jest.mocked(AppDataSource.query).mock.calls.find(([sql]) => sql.startsWith('INSERT'));
    expect(insert?.[1]).toContain('line-menu');
    expect(LineMessageApiService.SetRichmenuImage).toHaveBeenCalledTimes(1);
  });
  test('圖片上傳失敗清理新 LINE 選單且不寫入 published', async () => {
    jest.mocked(LineMessageApiService.SetRichmenuImage).mockRejectedValue(new Error('private-token'));
    await expect(publishRichmenu('menu')).rejects.toMatchObject({ statusCode: 502 });
    expect(LineMessageApiService.DeleteRichmenu).toHaveBeenCalledWith('line-menu');
    expect(jest.mocked(AppDataSource.query).mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
  test('發布期間資料改變時不覆蓋，清理本次選單', async () => {
    jest.mocked(LineMessageApiService.SetRichmenuImage).mockImplementation(async () => {
      row.name = 'new';
      return {};
    });
    await expect(publishRichmenu('menu')).rejects.toMatchObject({ statusCode: 409 });
    expect(LineMessageApiService.DeleteRichmenu).toHaveBeenCalledWith('line-menu');
  });
  test('已發布 ID 重用；會員查詢只回 ID 不呼叫建立', async () => {
    row.lineRchmenuId = 'existing';
    expect((await publishRichmenu('menu')).lineRchmenuId).toBe('existing');
    expect(await getPublishedMemberRichmenu('menu')).toBe('existing');
    expect(LineMessageApiService.CreateRichmenu).not.toHaveBeenCalled();
  });
  test('未發布會員選單被拒絕，不隱含建立', async () => {
    await expect(getPublishedMemberRichmenu('menu')).rejects.toMatchObject({ statusCode: 409 });
    expect(LineMessageApiService.CreateRichmenu).not.toHaveBeenCalled();
  });
  test('沒有 LINE ID 的舊公開資料視為草稿，列表過濾一致', async () => {
    expect(toRichmenuDto(row).status).toBe('draft');
    await listRichmenus('draft');
    expect(AppDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE NOT (status = 'published' AND COALESCE(lineRchmenuId, '') <> '')"),
      []
    );
  });
  test('預設選單不可直接修改以免使用者停留舊內容', async () => {
    row.isDefault = true;
    await expect(updateRichmenu('menu', payload('published'))).rejects.toMatchObject({ statusCode: 409 });
    expect(LineMessageApiService.CreateRichmenu).not.toHaveBeenCalled();
  });
  test('編輯發布會儲存新的 LINE ID', async () => {
    await updateRichmenu('menu', payload('published'));
    expect(LineMessageApiService.CreateRichmenu).toHaveBeenCalledTimes(1);
    const update = jest.mocked(AppDataSource.query).mock.calls.find(([sql]) => sql.startsWith('UPDATE'));
    expect(update?.[1]).toContain('line-menu');
  });
  test('新選單 LINE 建立失敗不新增本機資料', async () => {
    jest.mocked(LineMessageApiService.CreateRichmenu).mockRejectedValue({ response: { status: 400 } });
    await expect(createRichmenu(payload('published'))).rejects.toMatchObject({ statusCode: 502 });
    expect(jest.mocked(AppDataSource.query).mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  test('發布後 DB 提交失敗清理新 ID，保留原資料', async () => {
    jest.mocked(memberTransaction).mockRejectedValueOnce(new Error('database unavailable'));
    await expect(publishRichmenu('menu')).rejects.toThrow('database unavailable');
    expect(LineMessageApiService.DeleteRichmenu).toHaveBeenCalledWith('line-menu');
  });

});
