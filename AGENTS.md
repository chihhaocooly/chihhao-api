# AGENTS.md

本檔提供 coding agent 在此 repo 工作時的專案脈絡、慣例與驗證方式。請優先遵守本檔，再參考 README 或通用 Node/Express 慣例。

## 專案概況

- 這是 TypeScript Node.js API，主要框架為 Express 4。
- 入口檔是 `src/index.ts`，編譯後入口是 `lib/index.js`。
- Runtime port 預設為 `process.env.PORT || 8080`，適合 Cloud Run。
- 主要外部服務包含 Firebase Admin Auth、Google Application Default Credentials、LINE Bot SDK、Google Cloud、以及 `@chihhaocooly/chihhao-package`。
- README 目前內容很短，請以 `package.json`、`src/index.ts`、workflow 與本檔為準。

## 安裝與本機開發

`.npmrc` 使用 GitHub Packages：

```sh
@chihhaocooly:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${CHIHHAO_NPM_DOWNLOAD_TOKEN}
```

本機安裝依賴前通常需要設定：

```sh
export CHIHHAO_NPM_DOWNLOAD_TOKEN=...
npm install
```

常用指令：

```sh
npm run serve
npm run build
npm test
npm run format
npm run lint
```

- `npm run serve` 使用 `nodemon` + `ts-node ./src/index.ts` 監看 `src/**/*.ts`。
- `npm run build` 執行 `npx tsc -p .`，輸出到 `lib/`。
- `npm start` 執行 `node lib/index.js`，需要先 build。
- `npm run lint` 是 `eslint --fix ./src/**/*.ts`，會直接修改檔案；不要在只想檢查時誤用。
- `npm run format` 會對 `src/**/*.ts` 執行 Prettier 寫入。
- `npm test` 使用 Jest + ts-jest，測試檔命名需符合 `*.test.ts` 或 `*.spec.ts`。

## 專案結構

- `src/index.ts`：Express app、middleware、route mount、server listen。
- `src/controller/`：Express router 與 controller handler。
- `src/functions/`：商業邏輯與外部 API 操作。
- `src/middlewares/`：auth、Google access token 驗證、error handler。
- `src/firebase/`：Firebase Admin app/auth 初始化。
- `src/environment/`：環境旗標與共用設定。
- `src/@types/`：專案共用型別與錯誤類別。
- `.github/workflows/`：Cloud Run 與 GKE tag 部署流程。
- `.kube/`：GKE deployment manifest。

## Routing 與 Auth

`src/index.ts` 的 route 掛載順序很重要：

- `GET /`：health check，回傳 `OK`。
- `POST /webhook/lineWebhook`：LINE webhook，掛在 auth middleware 之前。
- `GET /getOutboundIp`：查詢 outbound IP，掛在 auth middleware 之前。
- `POST /getPartInfo`：查詢 park info，掛在 auth middleware 之前。
- `app.use(auth)` 之後才掛載需要授權的 API。
- `GET /lineMessage/allLineMessages`：需授權。
- `GET /richmenu/allRichmenuList`：需授權。
- `POST /richmenu/setDefaultRichmenu`：需授權，body 包含 `richmenuKey`。
- `GET /demo`：需授權。

新增 route 時必須明確決定是否需要 auth，並把 route 掛在正確位置。不要隨意把公開 route 放到 `app.use(auth)` 之前。

## 認證與 Firebase

- `src/middlewares/auth.ts` 會讀取 `Authorization: Bearer <token>`。
- 若 token 看起來像 JWT，會使用 Firebase Admin `verifyIdToken(idToken, true)` 驗證並把 `uid` 寫入 `req.body.uid`。
- 若 token 不是 Firebase ID token，會呼叫 Google `tokeninfo` API 驗證 access token。
- Firebase Admin 初始化位於 `src/firebase/getServiceAccount.ts`，使用 `credential.applicationDefault()`。
- 本機或容器執行需要 Application Default Credentials；Docker run script 會掛載 `~/.config/gcloud` 到 `/etc/gcp-sa`，但實際 credential path 仍需依執行環境確認。

## TypeScript 與格式

- `tsconfig.json` 啟用 `strict`、`noImplicitReturns`、`noUnusedLocals`。
- `noImplicitAny` 目前是 `false`，但新增程式碼仍應盡量使用明確型別。
- Module system 是 CommonJS，target 是 ES2017。
- Prettier 設定：2 spaces、single quotes、semicolons、print width 120、trailing commas `es5`。
- 避免新增未使用 import/變數，build 會因 `noUnusedLocals` 失敗。
- Controller 應保持薄層，主要邏輯放在 `src/functions/`。
- 非同步 Express handler 可直接 throw，專案已載入 `express-async-errors` 並使用 `errorHandler`。

## 錯誤處理與 Response

- 共用 response 型別是 `BaseResponse`，位於 `src/@types/base-response.ts`。
- 可預期的業務錯誤應使用 `MyError`，位於 `src/@types/my-error.ts`。
- `errorHandler` 會把 `MyError` 轉成指定 HTTP status 與 `statusMsg`；其他錯誤預設為 500。
- 新增 API 時避免直接回傳未整理的第三方錯誤或敏感資訊。

## LINE 與外部套件

- LINE webhook controller 使用 `@chihhaocooly/chihhao-package` 的 `LineWebhook`，並以 singleton/init promise 避免並發初始化。
- LINE message 與 richmenu 功能分散在 `src/functions/lineMessage*`、`src/functions/richmenu/` 與對應 controller。
- 修改 `@chihhaocooly/chihhao-package` 相關用法時，先確認套件版本與型別，避免假設未安裝的新 API。

## Docker 與部署

Docker image：

- `Dockerfile` 使用 `node:20-slim`，複製整個 repo，預設 `CMD ["npm", "start"]`。
- 因 `npm start` 需要 `lib/index.js`，build 必須在 image build 前完成或確保 image 內已有 `lib/`。
- `.dockerignore` 目前只忽略少量檔案，變更 Docker 行為前先檢查 build context。

部署指令：

```sh
npm run docker:build
npm run docker:push
npm run deploy
npm run deploy:dev
```

- `docker:build` 會先跑 format，會修改檔案。
- `deploy:dev` 會 build、docker build/push，並部署 Cloud Run `chihhao-api` 到 `asia-east1`。
- `deploy` 只執行 Cloud Run deploy，使用 `package.json` 版本作 image tag。
- 不要在未獲明確要求時執行 deploy、docker push 或會改遠端資源的 gcloud/kubectl 指令。

GitHub Actions：

- Tag `s*` 會建置並部署到 Cloud Run。
- Tag `sg*` 會建置、推 image，並套用 `.kube/stage-deployment.yaml` 到 GKE。
- Cloud Run workflow 使用 Node 18；GKE workflow 目前使用 Node 14。若修改需要新版 Node 的程式碼，必須同步評估 workflow。

## 驗證流程

一般程式碼變更後至少執行：

```sh
npm run build
```

若變更 business logic、middleware、controller 或型別，優先也執行：

```sh
npm test
```

若有格式或 lint 相關變更，可執行：

```sh
npm run format
npm run lint
```

注意：`format` 與 `lint` 都會寫入檔案。執行後請檢查 diff，避免混入無關格式化。

## 安全與協作規則

- 不要提交 service account JSON、GCP token、Firebase private key、LINE channel secret/access token、GitHub Packages token 或 `.env` 機密。
- 不要把 token、完整 request headers 或敏感 body 新增到長期 log；現有 log 若需調整，避免破壞除錯所需資訊。
- 不要重寫無關檔案或格式化整個 repo。
- 工作樹若已有未關聯變更，避免覆蓋；只處理任務必要檔案。
- 回覆時明確列出已修改檔案與已執行的驗證指令。
