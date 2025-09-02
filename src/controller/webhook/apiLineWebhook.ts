import { LineWebhook } from '@chihhaocooly/chihhao-package';
import { Request, Response } from 'express';

let _lineWebhook: LineWebhook | null = null;
let _initPromise: Promise<void> | null = null;

/**
 * 獲取唯一實例，保證多個請求同時進入時不會重複執行 init()
 */
async function getInstance(): Promise<LineWebhook> {
  if (!_lineWebhook) {
    if (!_initPromise) {
      // 如果沒有初始化，就建立初始化 Promise
      _initPromise = (async () => {
        _lineWebhook = new LineWebhook();
        await _lineWebhook.init();
      })();
    }
    // 等待初始化完成
    await _initPromise;
  }
  return _lineWebhook!;
}

/**
 * Line webhook 處理函式
 * @param req
 * @param res
 */
export const apiLineWebhook = async (req: Request, res: Response) => {
  console.log('apiLineWebhook');
  console.log('🚀 headers =>', JSON.stringify(req.headers));
  console.log('🚀 path =>', req.path, ' body =>', JSON.stringify(req.body));
  const lineWebhook = await getInstance();
  return lineWebhook.lineWebhookOnRequest(req, res);
};
