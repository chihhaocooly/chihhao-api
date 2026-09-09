import { AppDataSource, MemberSettings, MembershipError } from '@chihhaocooly/chihhao-package';
import { EntityManager } from 'typeorm';
import { MyError } from '../../@types/my-error';

export const memberTransaction = async <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> => {
  try {
    return await AppDataSource.transaction(async (manager) => {
      // 設定與引用共用鎖，避免設定刪除與問卷／會員新增引用交錯；後續依序鎖問卷、會員。
      const settings = await manager.findOne(MemberSettings, { where: { id: 1 }, lock: { mode: 'pessimistic_write' } });
      if (!settings) throw new MyError(503, '會員功能尚未完成資料庫初始化');
      return work(manager);
    });
  } catch (error) {
    if (error instanceof MembershipError) {
      throw new MyError(
        error.code === 'invalid' ? 400 : error.code === 'not-found' ? 404 : error.code === 'conflict' ? 409 : 500,
        error.message
      );
    }
    throw error;
  }
};
