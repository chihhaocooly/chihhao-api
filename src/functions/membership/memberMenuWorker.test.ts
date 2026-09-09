import { AppDataSource, LineMember, MemberMenuSync, MemberMenuSyncRepository } from '@chihhaocooly/chihhao-package';
import axios from 'axios';
import { SiteLineSettingsService } from '../siteSettings';
import * as richmenu from '../richmenu/richmenuService';
import { trySyncMemberMenu, trySyncIdentityGroupMenus } from './memberMenuWorker';

jest.mock('../richmenu/richmenuService', () => ({ getPublishedMemberRichmenu: jest.fn() }));

describe('操作觸發圖文選單同步', () => {
  let queued: MemberMenuSync;
  beforeEach(() => {
    queued = Object.assign(new MemberMenuSync(), {
      memberId: 'member',
      desiredRichmenuKey: null,
      generation: 1,
      status: 'pending',
      attemptCount: 0,
      leaseUntil: null,
      nextAttemptAt: null,
    });
    jest.spyOn(MemberMenuSyncRepository.prototype, 'find').mockImplementation(async () => queued);
    jest.spyOn(MemberMenuSyncRepository.prototype, 'claim').mockImplementation(async () => ({
      memberId: queued.memberId,
      desiredRichmenuKey: queued.desiredRichmenuKey,
      generation: queued.generation,
      attemptCount: 0,
      leaseToken: 'lease',
    }));
    jest.spyOn(MemberMenuSyncRepository.prototype, 'finish').mockImplementation(async (_claim, result) => {
      queued.status = result === 'synced' ? 'synced' : result === 'waiting-friend' ? 'waiting-friend' : 'pending';
      return true;
    });
    jest
      .spyOn(AppDataSource.manager, 'findOneBy')
      .mockResolvedValue(Object.assign(new LineMember(), { lineUserId: 'Utest', friendStatus: 'followed' }));
    jest.spyOn(SiteLineSettingsService.prototype, 'getMessageApiChannelAccessToken').mockResolvedValue('test');
    jest.spyOn(axios, 'delete').mockResolvedValue({ data: {} });
    jest.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.mocked(richmenu.getPublishedMemberRichmenu).mockResolvedValue('line-menu');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('指定選單會綁定，且 HTTP 有 timeout', async () => {
    queued.desiredRichmenuKey = 'menu';
    expect(await trySyncMemberMenu('member')).toBe('synced');
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/Utest/richmenu/line-menu'),
      {},
      expect.objectContaining({ timeout: 10000 })
    );
    expect(axios.delete).not.toHaveBeenCalled();
  });
  test('非好友不發布圖片、不呼叫 LINE', async () => {
    queued.desiredRichmenuKey = 'menu';
    jest
      .mocked(AppDataSource.manager.findOneBy)
      .mockResolvedValue(Object.assign(new LineMember(), { friendStatus: 'blocked' }));
    expect(await trySyncMemberMenu('member')).toBe('waiting-friend');
    expect(richmenu.getPublishedMemberRichmenu).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });
  test.each(['lease', 'backoff', 'synced'] as const)('%s 狀態不重複呼叫 LINE', async (state) => {
    if (state === 'lease') queued.leaseUntil = new Date(Date.now() + 60000);
    if (state === 'backoff') queued.nextAttemptAt = new Date(Date.now() + 60000);
    if (state === 'synced') queued.status = 'synced';
    await trySyncMemberMenu('member');
    expect(MemberMenuSyncRepository.prototype.claim).not.toHaveBeenCalled();
    expect(axios.delete).not.toHaveBeenCalled();
  });
  test('同步 DB 錯誤不拋出，也不輸出原始機密錯誤', async () => {
    jest.mocked(MemberMenuSyncRepository.prototype.find).mockRejectedValue(new Error('secret-token'));
    expect(await trySyncMemberMenu('member')).toBe('pending');
    expect(console.warn).toHaveBeenCalledWith('會員選單同步未完成，保留待辦供重試');
  });
  test('LINE 逾時持久化錯誤，不回報業務失敗', async () => {
    jest.mocked(axios.delete).mockRejectedValue({ code: 'ECONNABORTED' });
    expect(await trySyncMemberMenu('member')).toBe('pending');
    expect(MemberMenuSyncRepository.prototype.finish).toHaveBeenCalledWith(
      expect.anything(),
      'temporary-error',
      'line-timeout'
    );
  });
  test('持續變更目標最多處理三代，剩餘保留待辦', async () => {
    jest.mocked(MemberMenuSyncRepository.prototype.finish).mockImplementation(async () => {
      queued.generation++;
      return false;
    });
    expect(await trySyncMemberMenu('member')).toBe('pending');
    expect(axios.delete).toHaveBeenCalledTimes(3);
  });
  test('發布期間目標變更，不能將舊選單綁到新目標', async () => {
    queued.desiredRichmenuKey = 'old-menu';
    jest.mocked(richmenu.getPublishedMemberRichmenu).mockImplementation(async () => {
      queued = Object.assign(new MemberMenuSync(), queued, { generation: 2, desiredRichmenuKey: null });
      return 'old-line-menu';
    });
    jest.mocked(MemberMenuSyncRepository.prototype.finish).mockResolvedValueOnce(false);
    await trySyncMemberMenu('member');
    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.delete).toHaveBeenCalledTimes(1);
  });
  test('多個子身份共用一次查詢、50 人上限與 45 秒同步預算', async () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const query = jest
      .spyOn(AppDataSource.manager, 'query')
      .mockResolvedValue([{ memberId: 'one' }, { memberId: 'two' }]);
    jest.mocked(MemberMenuSyncRepository.prototype.finish).mockImplementation(async () => {
      now += 45000;
      return true;
    });
    await trySyncIdentityGroupMenus(['child-one', 'child-two']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('IN (?)'), [['child-one', 'child-two'], 50]);
    expect(axios.delete).toHaveBeenCalledTimes(1);
  });
  test('整組 LINE 失敗不拋出，仍處理下一位並保留待辦', async () => {
    jest.spyOn(AppDataSource.manager, 'query').mockResolvedValue([{ memberId: 'one' }, { memberId: 'two' }]);
    jest.mocked(axios.delete).mockRejectedValue({ response: { status: 503 } });
    await expect(trySyncIdentityGroupMenus(['child-one', 'child-two'])).resolves.toBeUndefined();
    expect(axios.delete).toHaveBeenCalledTimes(2);
    expect(MemberMenuSyncRepository.prototype.finish).toHaveBeenCalledWith(
      expect.anything(),
      'temporary-error',
      'line-unavailable'
    );
  });
});
