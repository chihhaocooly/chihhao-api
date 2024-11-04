import { Request, Response, NextFunction } from 'express';
import { BaseResponse } from '../@types/base-response';
import { MyError } from '../@types/my-error';

/**
 * 共用的錯誤處理器，用來接收所有路由拋出來的錯誤並轉化成適當的 Response 給前端
 */
export const errorHandler = async (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('errorHandler=>', err);

  const errorResponse: BaseResponse = {
    statusCode: 500,
    statusMsg: 'error',
  };
  //自訂的錯誤訊息
  if (err instanceof MyError) {
    const { statusCode, message } = err as MyError;
    errorResponse.statusCode = statusCode;
    errorResponse.statusMsg = message;
  }

  //系統錯誤
  res.status(errorResponse.statusCode).send(errorResponse);
};
