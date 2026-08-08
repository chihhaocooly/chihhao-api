import axios from 'axios';
import { normalizeKeywords, validateLineMessagePayload } from './lineMessageValidator';

jest.mock('axios');

const axiosMock = axios as jest.Mocked<typeof axios>;

describe('lineMessageValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes keywords by trimming empty and duplicate values', () => {
    expect(normalizeKeywords([' hello ', '', 'hello', ' world ', null])).toEqual(['hello', 'world']);
  });

  it('accepts a valid text message', async () => {
    const result = await validateLineMessagePayload({
      title: '問候語',
      type: 'text',
      keyWords: ['你好'],
      customPayload: {
        text: '您好',
      },
    });

    expect(result.isValid).toBe(true);
    expect(result.isSendable).toBe(true);
    expect(result.summary).toBe('您好');
    expect(result.normalized?.keyWords).toEqual(['你好']);
  });

  it('rejects an empty text message', async () => {
    const result = await validateLineMessagePayload({
      title: '空白訊息',
      type: 'text',
      keyWords: [],
      customPayload: {
        text: '   ',
      },
    });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors).toContainEqual({ field: 'customPayload', message: '文字訊息內容不可空白' });
  });

  it('accepts an image message when the image url is readable', async () => {
    axiosMock.head.mockResolvedValue({
      status: 200,
      headers: {
        'content-type': 'image/png',
      },
    });

    const result = await validateLineMessagePayload({
      title: '圖片',
      type: 'image',
      keyWords: [],
      customPayload: {
        originalContentUrl: 'https://example.com/image.png',
      },
    });

    expect(result.isValid).toBe(true);
    expect(axiosMock.head).toHaveBeenCalledWith('https://example.com/image.png', { timeout: 3000 });
  });

  it('rejects json messages without a LINE message type', async () => {
    const result = await validateLineMessagePayload({
      title: 'JSON',
      type: 'json',
      keyWords: [],
      customPayload: {
        text: 'missing type',
      },
    });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors).toContainEqual({ field: 'json', message: '自訂 JSON 必須包含 LINE message type' });
  });
});
