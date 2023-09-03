/**
 * 自訂的錯誤訊息類別，用來跟非預期的系統錯誤做區隔
 */
export class MyError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
