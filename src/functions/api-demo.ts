import type { Request, Response } from 'express';
import { BaseResponse } from '../@types/base-response';

/*
  @description 此 function 用於測試 API key 、錯誤處理 及 是否擁有 tw 及 us 的 firestore 物件權限
 */
export const apiDemo = async (req: Request, resp: Response) => {
  let base: BaseResponse = {
    statusCode: 200,
    statusMsg: ''
  };
  base['name'] = 'chihhao';

  resp.status(200).json(base);
};
