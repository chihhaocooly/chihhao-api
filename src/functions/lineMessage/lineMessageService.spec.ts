import { LineMessageRepository } from '@chihhaocooly/chihhao-package';
import { validateLineMessage } from './lineMessageService';

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
});
