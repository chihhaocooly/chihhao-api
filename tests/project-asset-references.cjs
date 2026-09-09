if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('請先 nvm use 20，再執行測試');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const MYSQL_IMAGE = 'mysql:8.4';
const DATABASE_NAME = 'asset_references_api_test';
const MAX_PORT_ATTEMPTS = 40;
const MAX_CONNECTION_ATTEMPTS = 90;
const MAX_TIMESTAMP_DRIFT_SECONDS = 2;
// 固定 API 與 MySQL 的不同時區，讓 CI 也能重現日期經 driver 轉換後的偏移。
process.env.TZ = 'Asia/Taipei';
const container = `codex-asset-references-api-${randomUUID()}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let started = false;
let db;
let repository;
let replace;

before(async () => {
  docker('run', '--rm', '-d', '--name', container, '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', '-e', 'TZ=UTC',
    '-e', `MYSQL_DATABASE=${DATABASE_NAME}`, '-p', '127.0.0.1::3306', MYSQL_IMAGE);
  started = true;
  let port;
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const state = JSON.parse(docker('inspect', container))[0];
    port = state.NetworkSettings.Ports['3306/tcp']?.[0]?.HostPort;
    if (port) break;
    await delay(100);
  }
  if (!port) throw new Error('一次性 MySQL 未提供 localhost 連接埠');

  // API 與正式安裝的 package 共用 singleton；import 前固定測試連線，避免沿用外部 DB 設定。
  Object.assign(process.env, {
    DB_HOST: '127.0.0.1', DB_PORT: port, DB_USER: 'root', DB_PASSWORD: '', DB_NAME: DATABASE_NAME, DB_SSL: 'false',
  });
  const { AppDataSource, ProjectAssetReferenceRepository } = require('@chihhaocooly/chihhao-package');
  const { GeneralizeProjectAssets1794400000000 } = require(
    '@chihhaocooly/chihhao-package/dist/mysql/migrations/1794400000000-GeneralizeProjectAssets'
  );
  db = AppDataSource;
  let lastError;
  for (let attempt = 0; attempt < MAX_CONNECTION_ATTEMPTS; attempt++) {
    try { await db.initialize(); lastError = null; break; }
    catch (error) { lastError = error; await delay(500); }
  }
  if (lastError) throw lastError;
  const runner = db.createQueryRunner();
  try { await new GeneralizeProjectAssets1794400000000().up(runner); }
  finally { await runner.release(); }
  repository = new ProjectAssetReferenceRepository();
  replace = require('../lib/functions/projectAsset/projectAssetService').replaceProjectAssetReferencesForEntity;
});

after(async () => {
  try { if (db?.isInitialized) await db.destroy(); }
  finally { if (started) docker('rm', '-f', container); }
});

const reference = (entityKey, overrides = {}) => ({
  assetKey: randomUUID(), ownerModule: 'surveyManagement', entityType: 'survey', entityKey,
  entityLabel: '會員問卷', usageProfileKey: 'surveyManagement.descriptionImage',
  usageRole: 'surveyDescriptionImage', usagePath: 'descriptionImageAssetKey', ...overrides,
});
const readScope = (entityType, entityKey) => db.query(
  'SELECT * FROM project_asset_reference WHERE entityType = ? AND entityKey = ? ORDER BY referenceKey', [entityType, entityKey],
);

test('API 替換傳遞真實 DB 錯誤並回復原引用，不留下部分新引用', async () => {
  const key = randomUUID();
  const old = reference(key);
  const other = reference(randomUUID());
  await replace('survey', key, [old]);
  await replace('survey', other.entityKey, [other]);
  const previous = await readScope('survey', key);
  const untouched = await readScope('survey', other.entityKey);
  const valid = reference(key);
  const invalid = reference(key, { entityLabel: 'x'.repeat(256) });

  // 第二筆觸發真實 MySQL 欄位限制；舊 API 會先刪舊資料並留下第一筆新引用。
  await assert.rejects(replace('survey', key, [valid, invalid]), { code: 'ER_DATA_TOO_LONG' });
  assert.deepEqual(await readScope('survey', key), previous);
  assert.equal(await repository.canDeleteAsset(old.assetKey), false);
  assert.deepEqual(await repository.findByAssetKey(valid.assetKey), []);
  assert.deepEqual(await repository.findByAssetKey(invalid.assetKey), []);
  assert.deepEqual(await readScope('survey', other.entityKey), untouched);
});

test('API 成功回傳 undefined，資料已寫入且同 key 的其他 entityType 不變', async () => {
  const key = randomUUID();
  const old = reference(key);
  const other = reference(key, { entityType: 'otherEntity' });
  await replace('survey', key, [old]);
  await replace('otherEntity', key, [other]);
  const untouched = await readScope('otherEntity', key);
  const replacements = [reference(key), reference(key, { usagePath: 'secondImage', isBlockingDelete: false })];

  assert.equal(await replace('survey', key, replacements), undefined);
  assert.equal((await readScope('survey', key)).length, 2);
  assert.equal(await repository.canDeleteAsset(old.assetKey), true);
  assert.equal(await repository.canDeleteAsset(replacements[0].assetKey), false);
  assert.equal(await repository.canDeleteAsset(replacements[1].assetKey), true);
  assert.deepEqual(await readScope('otherEntity', key), untouched);
});

test('API 引用時間維持資料庫目前時間語意', async (context) => {
  const key = randomUUID();
  await replace('survey', key, [reference(key)]);
  const [row] = await db.query(
    `SELECT UNIX_TIMESTAMP(createdAt) AS created, UNIX_TIMESTAMP(updatedAt) AS updated,
      UNIX_TIMESTAMP(CURRENT_TIMESTAMP) AS current FROM project_asset_reference WHERE entityKey = ?`, [key],
  );
  context.diagnostic(JSON.stringify(row));
  assert.ok(Math.abs(row.created - row.current) <= MAX_TIMESTAMP_DRIFT_SECONDS, JSON.stringify(row));
  assert.ok(Math.abs(row.updated - row.current) <= MAX_TIMESTAMP_DRIFT_SECONDS, JSON.stringify(row));
});

for (const input of ['empty', 'blank-asset-key']) {
  test(`API ${input} 清空目標集合且回傳 undefined，其他 entity 不變`, async () => {
    const key = randomUUID();
    const old = reference(key);
    const other = reference(randomUUID());
    await replace('survey', key, [old]);
    await replace('survey', other.entityKey, [other]);
    const untouched = await readScope('survey', other.entityKey);
    const replacements = input === 'empty' ? [] : [reference(key, { assetKey: '  ' })];

    assert.equal(await replace('survey', key, replacements), undefined);
    assert.deepEqual(await readScope('survey', key), []);
    assert.equal(await repository.canDeleteAsset(old.assetKey), true);
    assert.deepEqual(await readScope('survey', other.entityKey), untouched);
  });
}

test('API 保留最後重複用途、不同用途、空 assetKey 過濾與 blocking 預設', async () => {
  const key = randomUUID();
  const first = reference(key, { entityLabel: '初始標題' });
  assert.equal(await replace('survey', key, [
    first,
    { ...first, entityLabel: '更新標題' },
    { ...first, usagePath: 'anotherPath', isBlockingDelete: false },
    reference(key, { assetKey: '' }),
  ]), undefined);

  const stored = await repository.findByAssetKey(first.assetKey);
  assert.equal(stored.length, 2);
  const defaultReference = stored.find(item => item.usagePath === first.usagePath);
  const optionalReference = stored.find(item => item.usagePath === 'anotherPath');
  assert.equal(defaultReference.entityLabel, '更新標題');
  assert.equal(defaultReference.isBlockingDelete, true);
  assert.equal(optionalReference.isBlockingDelete, false);
  assert.equal((await readScope('survey', key)).length, 2);
});
