import { MyError } from '../../@types/my-error';
import { getLineMessageByKey, validateLineMessage } from './lineMessageService';
import { validateSavedLineMessage } from './validateSavedLineMessage';

jest.mock('./lineMessageService', () => ({ getLineMessageByKey: jest.fn(), validateLineMessage: jest.fn() }));
const key = '0ef8a85b-2e50-4d3a-a21b-7e7be2b922a1';

describe('validateSavedLineMessage', () => {
  beforeEach(() => jest.clearAllMocks());
  it('validates stored content while excluding its own keywords', async () => {
    const message = { lineMessageKey: key, keyWords: ['hello'], customPayload: { type: 'text', text: 'hello' }, isSendable: true };
    (getLineMessageByKey as jest.Mock).mockResolvedValue(message);
    (validateLineMessage as jest.Mock).mockResolvedValue({ isValid: true });
    expect(await validateSavedLineMessage(key)).toEqual({ isValid: true });
    expect(validateLineMessage).toHaveBeenCalledWith(message, key);
  });
  it('rejects missing messages', async () => {
    (getLineMessageByKey as jest.Mock).mockResolvedValue(null);
    await expect(validateSavedLineMessage(key)).rejects.toEqual(new MyError(404, '找不到訊息，請重新選擇'));
  });
  it('rejects invalid keys before querying', async () => {
    await expect(validateSavedLineMessage('bad')).rejects.toMatchObject({ statusCode: 400 });
    expect(getLineMessageByKey).not.toHaveBeenCalled();
  });
});
