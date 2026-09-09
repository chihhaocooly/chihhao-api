import { AppDataSource } from '@chihhaocooly/chihhao-package';
import axios from 'axios';
import { LineMessageApiService } from '../lineMessageApi/lineMessageApiService';
import { materializeMemberRichmenu } from './richmenuService';
import { RichmenuArea } from './richmenuTypes';

jest.mock('../projectAsset/projectAssetService', () => ({
  readProjectAsset: jest.fn(async () => ({ publicUrl: 'https://example.com/menu.jpg' })),
}));
jest.mock('sharp', () => ({ __esModule: true, default: () => ({
  resize() { return this; }, jpeg() { return this; }, async toBuffer() { return Buffer.from('image'); },
}) }));

const area = (type: string): RichmenuArea => ({
  x: 0, y: 0, width: 500, height: 500,
  action: { type, text: '查看進度', uri: 'https://example.com', title: '會員資料' },
});
describe('發布包含無動作區塊的圖文選單', () => {
  beforeEach(() => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: Buffer.from('source') });
    jest.spyOn(LineMessageApiService, 'CreateRichmenu').mockResolvedValue('line-menu');
    jest.spyOn(LineMessageApiService, 'SetRichmenuImage').mockResolvedValue({});
    jest.spyOn(LineMessageApiService, 'DeleteRichmenu').mockResolvedValue({});
  });
  afterEach(() => jest.restoreAllMocks());
  const setup = (areas: RichmenuArea[]) => {
    jest.spyOn(AppDataSource, 'query').mockResolvedValueOnce([{
      richmenuKey: 'menu', name: '待驗證', chatBarText: '審核中', width: 1527, height: 1030,
      assetKey: 'asset', status: 'published', type: 'general', enable: true, selected: true, areas,
    }]).mockResolvedValueOnce({ affectedRows: 1 });
  };
  test('純提示選單發布空熱區清單並上傳圖片', async () => {
    setup([area('none')]);
    await expect(materializeMemberRichmenu('menu')).resolves.toBe('line-menu');
    expect(LineMessageApiService.CreateRichmenu).toHaveBeenCalledWith(expect.objectContaining({ areas: [] }));
    expect(LineMessageApiService.SetRichmenuImage).toHaveBeenCalled();
  });
  test('略過無動作但保留文字與連結區塊', async () => {
    setup([area('none'), area('message'), area('uri')]);
    await materializeMemberRichmenu('menu');
    const payload = jest.mocked(LineMessageApiService.CreateRichmenu).mock.calls[0][0];
    expect(payload.areas.map(item => item.action.type)).toEqual(['message', 'uri']);
    expect(payload.areas[0].bounds.width).toBe(819);
  });
  test('未知動作仍拒絕發布', async () => {
    setup([area('unsupported')]);
    await expect(materializeMemberRichmenu('menu')).rejects.toThrow('尚未設定 LINE 支援的動作');
    expect(LineMessageApiService.CreateRichmenu).not.toHaveBeenCalled();
  });
});
