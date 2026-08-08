import { LineMessageRepository } from '@chihhaocooly/chihhao-package';
import { deleteLineMessage, validateLineMessage } from './lineMessageService';

jest.mock('./lineMessageSettingsStore', () => ({
  getReplySettings: jest.fn().mockResolvedValue({
    welcomeLineMessageKey: null,
    defaultReplyLineMessageKeys: [],
  }),
}));

jest.mock('@chihhaocooly/chihhao-package', () => ({
  LineMessageRepository: jest.fn(),
}));

const lineMessageRepositoryMock = LineMessageRepository as jest.MockedClass<typeof LineMessageRepository>;

describe('lineMessageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects keyword conflicts across message assets', async () => {
    lineMessageRepositoryMock.mockImplementation(() => ({
      findAll: jest.fn().mockResolvedValue([
        {
          lineMessageKey: 'existing-message',
          title: '既有訊息',
          type: 'text',
          keyWords: ['優惠'],
          customPayload: { text: '已有優惠' },
        },
      ]),
    } as unknown as LineMessageRepository));

    const result = await validateLineMessage({
      title: '新訊息',
      type: 'text',
      keyWords: ['優惠'],
      customPayload: {
        text: '新優惠',
      },
    });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors).toContainEqual({
      field: 'keyWords',
      message: '關鍵字「優惠」已被「既有訊息」使用',
    });
  });

  it('allows deleting a message with its own keywords', async () => {
    const deleteMock = jest.fn().mockResolvedValue(undefined);
    const message = {
      lineMessageKey: 'message-with-keyword',
      title: '有關鍵字的訊息',
      type: 'text',
      keyWords: ['測試'],
      customPayload: { text: '測試回覆' },
    };

    lineMessageRepositoryMock.mockImplementation(() => ({
      findByLineMessageKey: jest.fn().mockResolvedValue(message),
      delete: deleteMock,
    } as unknown as LineMessageRepository));

    const result = await deleteLineMessage('message-with-keyword');

    expect(result).toEqual({ deleted: true, missing: false, references: [] });
    expect(deleteMock).toHaveBeenCalledWith(message);
  });
});
