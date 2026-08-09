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

  it('accepts a template message with editor metadata', async () => {
    const result = await validateLineMessagePayload({
      title: '確認訊息',
      type: 'template',
      templateKey: 'templateConfirm',
      keyWords: [],
      customPayload: {
        type: 'template',
        altText: '請確認',
        template: {
          type: 'confirm',
          text: '是否繼續？',
          actions: [
            { type: 'message', label: '是', text: '是' },
            { type: 'message', label: '否', text: '否' },
          ],
        },
      },
      editorPayload: {
        confirmText: '是否繼續？',
      },
      editorPayloadVersion: 1,
    });

    expect(result.isValid).toBe(true);
    expect(result.normalized?.templateKey).toBe('templateConfirm');
    expect(result.normalized?.editorPayload).toEqual({ confirmText: '是否繼續？' });
  });

  it('accepts a valid imagemap message', async () => {
    const result = await validateLineMessagePayload({
      title: '互動圖片',
      type: 'imagemap',
      templateKey: 'imagemap',
      keyWords: [],
      customPayload: {
        type: 'imagemap',
        baseUrl: 'https://example.com/imagemap/demo',
        altText: '請點選圖片',
        baseSize: {
          width: 1040,
          height: 520,
        },
        actions: [
          {
            type: 'message',
            text: 'A',
            area: {
              x: 0,
              y: 0,
              width: 520,
              height: 520,
            },
          },
          {
            type: 'uri',
            linkUri: 'https://example.com',
            area: {
              x: 520,
              y: 0,
              width: 520,
              height: 520,
            },
          },
        ],
      },
    });

    expect(result.isValid).toBe(true);
    expect(result.isSendable).toBe(true);
    expect(result.summary).toBe('請點選圖片');
  });

  it('rejects imagemap postback actions because LINE imagemap does not support them', async () => {
    const result = await validateLineMessagePayload({
      title: '互動圖片',
      type: 'imagemap',
      keyWords: [],
      customPayload: {
        type: 'imagemap',
        baseUrl: 'https://example.com/imagemap/demo',
        altText: '請點選圖片',
        baseSize: {
          width: 1040,
          height: 520,
        },
        actions: [
          {
            type: 'postback',
            data: 'x=1',
            area: {
              x: 0,
              y: 0,
              width: 520,
              height: 520,
            },
          },
        ],
      },
    });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors).toContainEqual({ field: 'customPayload', message: 'Imagemap action 格式不正確' });
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
