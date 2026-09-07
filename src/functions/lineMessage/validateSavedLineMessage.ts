import { validate as isUuid } from 'uuid';
import { MyError } from '../../@types/my-error';
import { getLineMessageByKey, validateLineMessage } from './lineMessageService';
import { ValidateLineMessageResult } from './lineMessageTypes';

export const validateSavedLineMessage = async (lineMessageKey: string): Promise<ValidateLineMessageResult> => {
  if (!isUuid(lineMessageKey)) {
    throw new MyError(400, '訊息識別碼格式不正確');
  }
  const message = await getLineMessageByKey(lineMessageKey);
  if (!message) {
    throw new MyError(404, '找不到訊息，請重新選擇');
  }
  // 已儲存訊息必須排除自身，否則關鍵字會被當成重複。
  return validateLineMessage(message, lineMessageKey);
};
