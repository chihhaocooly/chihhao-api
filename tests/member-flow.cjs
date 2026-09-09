const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const pkg = require('@chihhaocooly/chihhao-package');
const { MemberConfigurationService } = require('../lib/functions/membership/memberConfigurationService');
const { MemberProfileService } = require('../lib/functions/membership/memberProfileService');
const { submitMemberSurvey } = require('../lib/functions/membership/memberSurveyService');
const { LineMemberService } = require('../lib/functions/lineMembers/lineMemberService');
const richmenuService = require('../lib/functions/richmenu/richmenuService');
const { SiteLineSettingsService } = require('../lib/functions/siteSettings');
const axios = require('axios');
const { DataSource } = require('typeorm');
let db;
const config = new MemberConfigurationService();
const profiles = new MemberProfileService();
const container = `codex-member-api-${randomUUID()}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let started = false;
before(async () => {
  docker('run', '--rm', '-d', '--name', container, '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', '-e', 'MYSQL_DATABASE=membership_api_test', '-p', '127.0.0.1::3306', 'mysql:8.4'); started = true;
  let port;
  for (let i = 0; i < 40; i++) { const info = JSON.parse(docker('inspect', container))[0]; port = Number(info.NetworkSettings.Ports['3306/tcp']?.[0]?.HostPort); if (port) break; await delay(250); }
  if (!port) throw new Error('隔離測試資料庫未取得本機連接埠');
  db = new DataSource({ ...pkg.AppDataSource.options, host: '127.0.0.1', port, username: 'root', password: '', database: 'membership_api_test', ssl: false, timezone: 'Z', synchronize: false, logging: false });
  let last;
  for (let i = 0; i < 90; i++) { try { await db.initialize(); last = null; break; } catch (error) { last = error; await delay(500); } }
  if (last) throw last;
  pkg.AppDataSource.manager = db.manager;
  pkg.AppDataSource.transaction = db.transaction.bind(db);
  pkg.AppDataSource.query = db.query.bind(db);
  const runner = db.createQueryRunner();
  try {
    await runner.query('CREATE TABLE site_line_setting (id int PRIMARY KEY)');
    for (const [name, file] of [
      ['AddLineMemberManagement1794600000000', '1794600000000-AddLineMemberManagement'],
      ['AddSurveyManagement1794700000000', '1794700000000-AddSurveyManagement'],
      ['OptimizeSurveyManagement1794800000000', '1794800000000-OptimizeSurveyManagement'],
      ['AddMemberIdentityAndProfileLinkage1795100000000', '1795100000000-AddMemberIdentityAndProfileLinkage'],
    ]) await new (require(`@chihhaocooly/chihhao-package/dist/mysql/migrations/${file}`)[name])().up(runner);
    await runner.query('CREATE TABLE richmenu (richmenuKey varchar(36) PRIMARY KEY, status varchar(20), type varchar(20), enable boolean, imageUrl text, assetKey varchar(36), lineRchmenuId varchar(100))');
  } finally { await runner.release(); }
});
after(async () => { try { if (db?.isInitialized) await db.destroy(); } finally { if (started) docker('rm', '-f', container); } });

const ensure = () => db.transaction(manager => new pkg.MemberDataRepository(manager).ensureMember(`U${randomUUID().replaceAll('-', '')}`));
const createSurvey = async (questions = []) => { const key = randomUUID(); await db.query('INSERT INTO survey (surveyKey, title, enable, repeatable, questions) VALUES (?, ?, 1, 1, ?)', [key, '會員資料更新', JSON.stringify(questions)]); return key; };
const setup = async () => {
  const gold = (await config.saveIdentity(null, { name: '金卡', isEnabled: true, sortOrder: 0 })).item;
  const silver = (await config.saveIdentity(null, { name: '銀卡', isEnabled: true, sortOrder: 1 })).item;
  const pending = (await config.saveSubIdentity(gold.id, null, { name: '待驗證', isEnabled: true, richmenuKey: null })).item;
  const verified = (await config.saveSubIdentity(gold.id, null, { name: '已驗證', isEnabled: true, richmenuKey: null })).item;
  const ordinary = (await config.saveSubIdentity(silver.id, null, { name: '一般', isEnabled: true, richmenuKey: null })).item;
  return { pending, verified, ordinary };
};

test('會員問卷：符合來源才切換，欄位／快照／歷程／防重送原子保存', async () => {
  const { pending, verified, ordinary } = await setup();
  const field = (await config.saveField(null, { label: '愛吃的水果', type: 'text', isEnabled: true, sortOrder: 0, options: [], validation: {} })).item;
  const surveyKey = await createSurvey([{ id: 'fruit', title: '愛吃的水果', type: 'member-field', required: true, memberFieldBinding: { fieldId: field.id, updateMode: 'overwrite' } }]);
  await config.saveForm(surveyKey, { targetSubIdentityId: pending.id, allowedSourceSubIdentityIds: [null], isEnabled: true });
  const member = await ensure();
  const request = { surveyId: surveyKey, userId: member.lineUserId, requestId: randomUUID(), surveyVersion: 2, answers: [{ questionId: 'fruit', type: 'member-field', answer: '蘋果' }] };
  const first = await submitMemberSurvey(request);
  assert.equal(first.membershipOutcome, 'changed');
  assert.deepEqual(await submitMemberSurvey(request), first);
  let detail = await profiles.detail(member.id);
  assert.equal(detail.membership.subIdentityId, pending.id);
  assert.equal(detail.profile.find(item => item.field.id === field.id).value, '蘋果');
  assert.equal((await profiles.history(member.id, 'survey-reports')).total, 1);
  const second = await submitMemberSurvey({ ...request, requestId: randomUUID(), answers: [{ questionId: 'fruit', type: 'member-field', answer: '香蕉' }] });
  assert.equal(second.membershipOutcome, 'skipped-source');
  detail = await profiles.detail(member.id);
  assert.equal(detail.membership.subIdentityId, pending.id);
  assert.equal(detail.profile.find(item => item.field.id === field.id).value, '香蕉');
  const transition = { subIdentityId: verified.id, expectedVersion: detail.membership.version, requestId: randomUUID(), reason: '管理員審閱通過' };
  const changed = await profiles.transition(member.id, transition, 'admin');
  assert.equal(changed.changed, true);
  assert.deepEqual(await profiles.transition(member.id, transition, 'admin'), changed);
  await assert.rejects(profiles.transition(member.id, { ...transition, requestId: randomUUID(), subIdentityId: ordinary.id }, 'admin'), { statusCode: 409 });
  const latestVersion = (await profiles.detail(member.id)).membership.version;
  await profiles.transition(member.id, { subIdentityId: ordinary.id, expectedVersion: latestVersion, requestId: randomUUID() }, 'admin');
  assert.equal((await profiles.detail(member.id)).membership.identityName, '銀卡');
  await assert.rejects(config.deleteField(field.id), { statusCode: 409 });
  await assert.rejects(config.deleteIdentity(pending.id, true), { statusCode: 409 });
  await db.query('UPDATE survey SET title = ?, questions = ?, version = version + 1 WHERE surveyKey = ?', ['新標題', '[]', surveyKey]);
  const reports = await profiles.history(member.id, 'survey-reports');
  assert.equal(reports.items[0].snapshot.surveyTitle, '會員資料更新');
  assert.equal(reports.items[0].snapshot.questions[0].title, '愛吃的水果');
});

test('非法答案與過期版本不寫入；相同版本的並發管理操作只有一筆成功', async () => {
  const { pending, verified } = await setup();
  const member = await ensure();
  const results = await Promise.allSettled([pending.id, verified.id].map(subIdentityId => profiles.transition(member.id, { subIdentityId, expectedVersion: 0, requestId: randomUUID() }, 'admin')));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal((await profiles.history(member.id, 'changes')).total, 1);
  const key = await createSurvey([{ id: 'one', title: '必填', type: 'text', required: true }]);
  const request = { surveyId: key, userId: member.lineUserId, requestId: randomUUID(), surveyVersion: 1, answers: [] };
  await assert.rejects(submitMemberSurvey(request), { statusCode: 400 });
  await assert.rejects(submitMemberSurvey({ ...request, surveyVersion: 0 }), { statusCode: 409 });
  assert.equal((await profiles.history(member.id, 'survey-reports')).total, 0);
});

test('不使用 Scheduler：立即同步、失敗保留身份、人工重試與 follow 恢復', async () => {
  const { pending, verified } = await setup();
  const member = await ensure();
  await profiles.transition(member.id, { subIdentityId: pending.id, expectedVersion: 0, requestId: randomUUID() }, 'admin');
  assert.equal((await profiles.detail(member.id)).menuSync.status, 'waiting-friend');
  const originalToken = SiteLineSettingsService.prototype.getMessageApiChannelAccessToken;
  const originalDelete = axios.delete;
  SiteLineSettingsService.prototype.getMessageApiChannelAccessToken = async () => 'isolated-test-token';
  let calls = 0;
  try {
    axios.delete = async () => { calls++; throw { response: { status: 503 } }; };
    await db.query("UPDATE line_member SET friendStatus = 'followed' WHERE id = ?", [member.id]);
    const request = { subIdentityId: verified.id, expectedVersion: 1, requestId: randomUUID() };
    const result = await profiles.transition(member.id, request, 'admin');
    const detail = await profiles.detail(member.id);
    assert.equal(detail.membership.subIdentityId, verified.id);
    assert.equal(detail.menuSync.status, 'pending');
    assert.equal(detail.menuSync.lastErrorCode, 'line-unavailable');
    assert.equal(calls, 1);
    assert.deepEqual(await profiles.transition(member.id, request, 'admin'), result);
    assert.equal(calls, 1, '重送不可再次同步');
    axios.delete = async () => { calls++; return { data: {} }; };
    assert.equal((await profiles.retry(member.id)).menuSyncStatus, 'synced');
    assert.equal((await profiles.detail(member.id)).menuSync.status, 'synced');
    assert.equal(calls, 2);
    await db.query("UPDATE line_member SET friendStatus = 'blocked' WHERE id = ?", [member.id]);
    assert.equal((await profiles.retry(member.id)).menuSyncStatus, 'waiting-friend');
    await new LineMemberService().ingestWebhook({ destination: 'test', events: [{ type: 'follow', webhookEventId: randomUUID(), timestamp: Date.now(), source: { type: 'user', userId: member.lineUserId }, replyToken: 'test', mode: 'active' }] });
    assert.equal((await profiles.detail(member.id)).menuSync.status, 'synced');
    assert.equal(calls, 3);
  } finally { SiteLineSettingsService.prototype.getMessageApiChannelAccessToken = originalToken; axios.delete = originalDelete; }
});

test('單人同步不掃描別人，問卷立即同步，競爭時持有者補上最新身份', async () => {
  const { pending, verified } = await setup();
  const member = await ensure();
  const unrelated = await ensure();
  await db.transaction(manager => new pkg.MemberMenuSyncRepository(manager).queue(unrelated.id, null));
  await db.query("UPDATE line_member SET friendStatus = 'followed' WHERE id = ?", [member.id]);
  const originalToken = SiteLineSettingsService.prototype.getMessageApiChannelAccessToken;
  const originalDelete = axios.delete;
  SiteLineSettingsService.prototype.getMessageApiChannelAccessToken = async () => 'isolated-test-token';
  let calls = 0;
  try {
    axios.delete = async (url) => {
      assert.ok(url.includes(member.lineUserId));
      calls++;
      if (calls === 1) await profiles.transition(member.id, { subIdentityId: verified.id, expectedVersion: 1, requestId: randomUUID() }, 'admin');
      return { data: {} };
    };
    const surveyId = await createSurvey();
    await config.saveForm(surveyId, { targetSubIdentityId: pending.id, allowedSourceSubIdentityIds: [null], isEnabled: true });
    const request = { surveyId, userId: member.lineUserId, requestId: randomUUID(), surveyVersion: 2, answers: [] };
    const result = await submitMemberSurvey(request);
    assert.equal(result.membershipOutcome, 'changed');
    assert.equal(calls, 2, '舊工作釋放後立即同步新 generation');
    const detail = await profiles.detail(member.id);
    assert.equal(detail.membership.subIdentityId, verified.id);
    assert.equal(detail.menuSync.status, 'synced');
    assert.equal((await profiles.detail(unrelated.id)).menuSync.attemptCount, 0);
    assert.deepEqual(await submitMemberSurvey(request), result);
    assert.equal(calls, 2);
  } finally { SiteLineSettingsService.prototype.getMessageApiChannelAccessToken = originalToken; axios.delete = originalDelete; }
});

test('子身份更換選單只立即處理該身份，綁定及解除均完成', async () => {
  const { pending, verified } = await setup();
  const member = await ensure();
  const other = await ensure();
  await profiles.transition(member.id, { subIdentityId: pending.id, expectedVersion: 0, requestId: randomUUID() }, 'admin');
  await profiles.transition(other.id, { subIdentityId: verified.id, expectedVersion: 0, requestId: randomUUID() }, 'admin');
  await db.query("UPDATE line_member SET friendStatus = 'followed' WHERE id = ?", [member.id]);
  const key = randomUUID();
  await db.query("INSERT INTO richmenu VALUES (?, 'published', 'general', 1, 'test-image', NULL, 'line-menu-test')", [key]);
  const originalToken = SiteLineSettingsService.prototype.getMessageApiChannelAccessToken;
  const originalMaterialize = richmenuService.getPublishedMemberRichmenu;
  const originalPost = axios.post;
  const originalDelete = axios.delete;
  SiteLineSettingsService.prototype.getMessageApiChannelAccessToken = async () => 'isolated-test-token';
  richmenuService.getPublishedMemberRichmenu = async menuKey => { assert.equal(menuKey, key); return 'line-menu-test'; };
  let linked = 0;
  let unlinked = 0;
  axios.post = async url => { assert.ok(url.endsWith(`${member.lineUserId}/richmenu/line-menu-test`)); linked++; return { data: {} }; };
  axios.delete = async url => { assert.ok(url.endsWith(`${member.lineUserId}/richmenu`)); unlinked++; return { data: {} }; };
  try {
    await config.saveSubIdentity(null, pending.id, { richmenuKey: key });
    assert.equal((await profiles.detail(member.id)).menuSync.status, 'synced');
    assert.equal((await profiles.detail(other.id)).menuSync.status, 'waiting-friend');
    await config.saveSubIdentity(null, pending.id, { richmenuKey: null });
    assert.equal((await profiles.detail(member.id)).menuSync.status, 'synced');
    assert.equal(linked, 1);
    assert.equal(unlinked, 1);
  } finally {
    SiteLineSettingsService.prototype.getMessageApiChannelAccessToken = originalToken;
    richmenuService.getPublishedMemberRichmenu = originalMaterialize;
    axios.post = originalPost;
    axios.delete = originalDelete;
  }
});
