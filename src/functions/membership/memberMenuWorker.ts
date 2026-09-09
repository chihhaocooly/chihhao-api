import {
  AppDataSource,
  LineMember,
  MemberMenuSyncRepository,
  MemberMenuSync,
  MemberMenuSyncResult,
  MemberMenuSyncErrorCode,
} from '@chihhaocooly/chihhao-package';
import axios from 'axios';
import { MyError } from '../../@types/my-error';
import { getPublishedMemberRichmenu } from '../richmenu/richmenuService';
import { SiteLineSettingsService } from '../siteSettings';

const LINE_TIMEOUT_MS = 10000;
const PROCESS_BUDGET_MS = 45000;
export const classifyMenuError = (error: unknown): { result: MemberMenuSyncResult; code: MemberMenuSyncErrorCode } => {
  const item = error as { response?: { status?: number }; code?: string };
  const status = item?.response?.status;
  if (status === 429) return { result: 'temporary-error', code: 'line-rate-limit' };
  if (status === 401 || status === 403) return { result: 'permanent-error', code: 'line-auth' };
  if (status === 400 || status === 404 || error instanceof MyError)
    return { result: 'permanent-error', code: 'invalid-menu' };
  return { result: 'temporary-error', code: item?.code === 'ECONNABORTED' ? 'line-timeout' : 'line-unavailable' };
};

const MAX_BATCH_SIZE = 50;
const MAX_GENERATIONS_PER_REQUEST = 3;

const processMemberMenu = async (memberId: string): Promise<number> => {
  const repository = new MemberMenuSyncRepository();
  let processed = 0;
  for (let attempt = 0; attempt < MAX_GENERATIONS_PER_REQUEST; attempt++) {
    const queued = await repository.find(memberId);
    if (
      !queued ||
      queued.status !== 'pending' ||
      (queued.leaseUntil && new Date(queued.leaseUntil).getTime() > Date.now()) ||
      (queued.nextAttemptAt && new Date(queued.nextAttemptAt).getTime() > Date.now())
    )
      break;
    // 圖片發布在取得 lease 前完成，避免圖片處理占用個人綁定的時限。
    let menuId: string | null = null;
    let preparationError: unknown;
    try {
      const member = await AppDataSource.manager.findOneBy(LineMember, { id: memberId });
      if (member?.friendStatus === 'followed' && queued.desiredRichmenuKey)
        menuId = await getPublishedMemberRichmenu(queued.desiredRichmenuKey);
    } catch (error) {
      preparationError = error;
    }
    const claim = await repository.claim(memberId);
    if (!claim) break;
    if (claim.generation !== queued.generation) {
      await repository.finish({ ...claim, generation: queued.generation }, 'temporary-error');
      continue;
    }
    let completed: boolean;
    try {
      if (preparationError) throw preparationError;
      const member = await AppDataSource.manager.findOneBy(LineMember, { id: memberId });
      if (!member || member.friendStatus !== 'followed') {
        completed = await repository.finish(claim, 'waiting-friend');
      } else {
        // 好友狀態可能在發布準備期間改變，不能誤將尚未發布的目標當作 OA 預設。
        if (claim.desiredRichmenuKey && !menuId) {
          await repository.finish(claim, 'temporary-error', 'line-unavailable');
          break;
        }
        const token = await new SiteLineSettingsService().getMessageApiChannelAccessToken();
        const base = `https://api.line.me/v2/bot/user/${encodeURIComponent(member.lineUserId)}/richmenu`;
        const options = { headers: { Authorization: `Bearer ${token}` }, timeout: LINE_TIMEOUT_MS };
        if (menuId) await axios.post(`${base}/${encodeURIComponent(menuId)}`, {}, options);
        else await axios.delete(base, options);
        completed = await repository.finish(claim, 'synced');
      }
    } catch (error) {
      const classified = classifyMenuError(error);
      completed = await repository.finish(claim, classified.result, classified.code);
    }
    processed++;
    // 舊請求持有 lease 時，新請求無法處理；由持有者接著處理最新 generation。
    if (completed) break;
  }
  return processed;
};

/** 已提交的身份／問卷不可因 LINE 或同步狀態讀寫失敗而回報儲存失敗。 */
export const trySyncMemberMenu = async (memberId: string): Promise<MemberMenuSync['status'] | null> => {
  try {
    await processMemberMenu(memberId);
    return (await new MemberMenuSyncRepository().find(memberId))?.status ?? null;
  } catch {
    console.warn('會員選單同步未完成，保留待辦供重試');
    return 'pending';
  }
};

const processBatch = async (memberIds: string[]): Promise<{ processed: number }> => {
  const started = Date.now();
  let processed = 0;
  for (const memberId of memberIds) {
    if (Date.now() - started >= PROCESS_BUDGET_MS) break;
    processed += await processMemberMenu(memberId);
  }
  return { processed };
};

export const processMemberMenus = async (): Promise<{ processed: number }> =>
  processBatch(await new MemberMenuSyncRepository().listDue(MAX_BATCH_SIZE));

export const trySyncSubIdentityMenus = async (subIdentityId: string): Promise<void> =>
  trySyncIdentityGroupMenus([subIdentityId]);

export const trySyncIdentityGroupMenus = async (subIdentityIds: string[]): Promise<void> => {
  if (!subIdentityIds.length) return;
  try {
    const rows = (await AppDataSource.manager.query(
      `SELECT sync.memberId FROM member_menu_sync sync
       INNER JOIN line_member member ON member.id = sync.memberId
       WHERE member.subIdentityId IN (?) AND sync.status = 'pending'
       AND (sync.nextAttemptAt IS NULL OR sync.nextAttemptAt <= UTC_TIMESTAMP(6))
       AND (sync.leaseUntil IS NULL OR sync.leaseUntil <= UTC_TIMESTAMP(6))
       ORDER BY sync.memberId LIMIT ?`,
      [subIdentityIds, MAX_BATCH_SIZE]
    )) as { memberId: string }[];
    await processBatch(rows.map((row) => row.memberId));
  } catch {
    console.warn('子身份選單批次同步未完成，保留待辦供重試');
  }
};
