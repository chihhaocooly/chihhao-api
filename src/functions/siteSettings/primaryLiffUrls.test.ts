import { AppDataSource } from '@chihhaocooly/chihhao-package';
import { getPrimaryLiffUrls } from './primaryLiffUrls';

afterEach(() => jest.restoreAllMocks());
test('沒有主要 LIFF 時不製造網址', async () => {
  jest.spyOn(AppDataSource, 'query').mockResolvedValue([]);
  expect(await getPrimaryLiffUrls()).toBeNull();
});
test('問卷與固定會員入口共用主要 LIFF 且安全編碼', async () => {
  jest.spyOn(AppDataSource, 'query').mockResolvedValue([{ liffId: '123-abc' }]);
  const urls = await getPrimaryLiffUrls();
  expect(urls?.member).toBe('https://liff.line.me/123-abc/member');
  expect(urls?.survey('a&b')).toBe('https://liff.line.me/123-abc/survey?surveyId=a%26b');
});
