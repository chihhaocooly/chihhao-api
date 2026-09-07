import { LineMemberRepository } from '@chihhaocooly/chihhao-package';
import { LineMemberPushService } from './lineMemberPushService';
import { validateSavedLineMessage } from '../lineMessage/validateSavedLineMessage';

jest.mock('@chihhaocooly/chihhao-package', () => ({ LineMemberRepository: jest.fn() }));
jest.mock('../lineMessage/validateSavedLineMessage', () => ({ validateSavedLineMessage: jest.fn() }));
jest.mock('../siteSettings', () => ({ SiteLineSettingsService: jest.fn() }));

const id = '0ef8a85b-2e50-4d3a-a21b-7e7be2b922a1';
const body = { lineMessageKey: id, retryKey: '5afccff7-9de3-41f7-a238-dc6ecdc966d4' };

describe('LineMemberPushService', () => {
  const findById = jest.fn();
  const validateMessage = validateSavedLineMessage as jest.MockedFunction<typeof validateSavedLineMessage>;
  const pushMessage = jest.fn();
  const setRequestOptionOnce = jest.fn();
  const createClient = jest.fn(async () => ({ pushMessage, setRequestOptionOnce }));
  const service = new LineMemberPushService({ findById } as Pick<LineMemberRepository, 'findById'>, validateMessage, createClient);

  beforeEach(() => {
    jest.clearAllMocks();
    findById.mockResolvedValue({ lineUserId: 'Ustored', friendStatus: 'followed' });
    pushMessage.mockResolvedValue({});
    validateMessage.mockResolvedValue({
      isValid: true, isSendable: true, summary: 'hello', fieldErrors: [],
      normalized: { title: 'hello', type: 'text', templateKey: 'text', keyWords: [],
        customPayload: { text: 'hello' }, editorPayload: null, editorPayloadVersion: 1 },
    });
  });

  it('sends only stored content to the stored single recipient with the retry key', async () => {
    expect(await service.pushMessage(id, { ...body, to: 'Uattacker', customPayload: { text: 'bad' } }))
      .toEqual({ status: 'accepted' });
    expect(findById).toHaveBeenCalledWith(id);
    expect(validateMessage).toHaveBeenCalledWith(body.lineMessageKey);
    expect(setRequestOptionOnce).toHaveBeenCalledWith({ retryKey: body.retryKey });
    expect(pushMessage).toHaveBeenCalledWith('Ustored', { type: 'text', text: 'hello' });
    expect(pushMessage).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['image', { originalContentUrl: 'https://example.com/a.png', previewImageUrl: 'https://example.com/a.png' }],
    ['flex', { altText: '卡片', contents: { type: 'bubble' } }],
    ['imagemap', { type: 'imagemap', baseUrl: 'https://example.com/map' }],
    ['json', { type: 'sticker', packageId: '1', stickerId: '1' }],
  ] as const)('builds LINE payload for %s without changing custom JSON type', async (type, customPayload) => {
    validateMessage.mockResolvedValue({
      isValid: true, isSendable: true, summary: '', fieldErrors: [],
      normalized: { title: '素材', type, templateKey: null, keyWords: [],
        customPayload, editorPayload: null, editorPayloadVersion: 1 },
    });
    await service.pushMessage(id, body);
    expect(pushMessage).toHaveBeenCalledWith('Ustored', type === 'json' ? customPayload : { ...customPayload, type });
  });

  it.each([null, {}, { ...body, retryKey: 'bad' }, { ...body, lineMessageKey: 1 }])('rejects invalid body %s', async (input) => {
    await expect(service.pushMessage(id, input)).rejects.toMatchObject({ statusCode: 400 });
    expect(findById).not.toHaveBeenCalled();
    expect(pushMessage).not.toHaveBeenCalled();
  });
  it('rejects invalid member ID', async () => {
    await expect(service.pushMessage('bad', body)).rejects.toMatchObject({ statusCode: 400 });
    expect(findById).not.toHaveBeenCalled();
  });
  it('rejects a missing member', async () => {
    findById.mockResolvedValue(null);
    await expect(service.pushMessage(id, body)).rejects.toMatchObject({ statusCode: 404 });
    expect(pushMessage).not.toHaveBeenCalled();
  });
  it.each(['blocked', 'unknown'])('rejects current %s status even after preview', async (friendStatus) => {
    findById.mockResolvedValue({ lineUserId: 'Ustored', friendStatus });
    await expect(service.pushMessage(id, body)).rejects.toMatchObject({ statusCode: 409 });
    expect(validateMessage).not.toHaveBeenCalled();
    expect(pushMessage).not.toHaveBeenCalled();
  });
  it('rejects invalid content/assets despite a saved sendable flag', async () => {
    validateMessage.mockResolvedValue({ isValid: false, isSendable: false, summary: '', fieldErrors: [] });
    await expect(service.pushMessage(id, body)).rejects.toMatchObject({ statusCode: 422 });
    expect(createClient).not.toHaveBeenCalled();
  });
  it('accepts only LINE conflicts with an accepted request ID', async () => {
    pushMessage.mockRejectedValue({ statusCode: 409, originalError: { response: { headers: { 'x-line-accepted-request-id': 'accepted' } } } });
    expect(await service.pushMessage(id, body)).toEqual({ status: 'accepted' });
    expect(pushMessage).toHaveBeenCalledTimes(1);
  });
  it.each([[400, 422], [401, 503], [403, 503], [409, 502], [429, 429], [500, 502]])('sanitizes LINE %s without automatic retries', async (statusCode, expected) => {
    pushMessage.mockRejectedValue({ statusCode, message: 'secret-token' });
    await expect(service.pushMessage(id, body)).rejects.toMatchObject({ statusCode: expected });
    expect(pushMessage).toHaveBeenCalledTimes(1);
  });
});
