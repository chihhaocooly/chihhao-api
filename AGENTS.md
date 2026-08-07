# AGENTS.md

本檔提供 coding agent 在此 repo 工作時的專案脈絡、慣例與驗證方式。請優先遵守本檔，再參考 README 或通用 Node/Express 慣例。

## 專案概況

- 這是 TypeScript Node.js API，主要框架為 Express 4。
- 入口檔是 `src/index.ts`，編譯後入口是 `lib/index.js`。
- Runtime port 預設為 `process.env.PORT || 8080`，適合 Cloud Run。
- 主要外部服務包含 Firebase Admin Auth、Google Application Default Credentials、LINE Bot SDK、Google Cloud、以及 `@chihhaocooly/chihhao-package`。
- README 目前內容很短，請以 `package.json`、`src/index.ts`、workflow 與本檔為準。

## 相關 Repos 與協作邊界

這個 workspace 主要有三個互相關聯的 repo：

- `/Users/huangcooly/Documents/GitHubForChihhao/chihhao-angular`：前端 Angular app，透過 HTTP 呼叫本 repo。
- `/Users/huangcooly/Documents/GitHubForChihhao/chihhao-api`：後端 TypeScript/Express API，是 Angular 與 package 之間的 contract 層。
- `/Users/huangcooly/Documents/GitHubForChihhao/chihhao-package`：共用 TypeScript library，發布為 `@chihhaocooly/chihhao-package`，供本 repo 使用 LINE webhook、MySQL/TypeORM entity/repository 與 DTO/type。

依賴方向：

```text
chihhao-angular -> chihhao-api -> @chihhaocooly/chihhao-package
```

- Angular 不直接依賴 `chihhao-package`；前端資料 shape 應由本 repo 的 HTTP API contract 穩定提供。
- 本 repo 不應複製 package 的 entity、repository 或 DTO；需要共用型別時，先確認 `chihhao-package` 是否已有 public export。
- 修改 API response、request、route 或 auth 行為時，必須同步檢查 Angular API service 與畫面使用點，尤其是 `chihhao-angular/src/app/shared/chih-hao-api/`。
- 修改 package public exports、DTO/type、entity、repository、migration 或 LINE/MySQL 行為時，必須同步檢查本 repo 對 `@chihhaocooly/chihhao-package` 的依賴版本與使用點。
- 新增模組、跨 repo 功能、API contract 變更或資料模型變更時，規格以 Angular repo 的 `specs/modules/<module-name>/` 為主要入口；若需求文件已存在於其他規格目錄，先確認使用者要沿用哪個位置，不要分裂成兩套 contract。

從本 repo 開始工作時，請先判斷變更範圍：

- 只改 API 內部實作且不改 endpoint contract：通常只需要修改 `chihhao-api`，但仍需跑本 repo build/test。
- 新增或修改 endpoint、request/response shape、錯誤碼或權限：先更新或確認規格，再修改本 repo，最後同步 Angular service/type/UI。
- 需要新的 package DTO、entity、repository、migration 或 LINE webhook 共用行為：先到 `chihhao-package` 修改、build、commit 並發布正式版本；本 repo 安裝該正式版本後再繼續對接，最後檢查 Angular 是否受 API contract 影響。
- 若只是不確定前端需求或畫面流程，不要猜測欄位；到 `chihhao-angular` 查 spec、route、component 與 API service。

跨 repo 驗證建議：

- 只改 API：在 `chihhao-api` 執行 `npm run build`，若動到 business logic、middleware、controller 或型別，優先也跑 `npm test`。
- 改 API + Angular：先在 `chihhao-api` 執行 `npm run build`，必要時 `npm test`；再回 `chihhao-angular` 執行 `npm run build`。
- 改 package + API：先在 `chihhao-package` 執行 build/test、commit、tag/publish；再讓本 repo 安裝已發布版本，最後在 `chihhao-api` 執行 `npm run build` 與 `npm test`。
- 改 package + API + Angular：先發布 package 正式版本，再更新/build/test API，最後依 API contract build/test Angular。
- 不要在未獲明確要求時執行 deploy、docker push、npm publish、migration:run、migration:revert、sync-db-schema 或其他會改遠端資源/資料庫的指令。

若 `chihhao-package` 有 public exports、DTO、entity、repository、migration 或 LINE/MySQL 行為變更，預設必須先發布正式 package 版本，再讓本 repo 更新正式 dependency/lockfile；不要把本機 package 安裝當作完成驗證。

本機 package 對接只允許作為短期探索例外。若 package 尚未發布，而本 repo 需要立即確認可行性：

1. 先在 `/Users/huangcooly/Documents/GitHubForChihhao/chihhao-package` 執行 `npm run build`。
2. 優先用 package repo 的 `npm pack` tarball 做短期安裝驗證；避免直接 `npm install ../chihhao-package --no-save` 污染本 repo 的 `node_modules` dependency tree。
3. 在 `chihhao-api` 執行 `npm run build`，必要時執行 `npm test`。
4. 回報時要明確說明這只是本機探索驗證，不能作為完成狀態；正式開發與部署前仍需發布新版 `@chihhaocooly/chihhao-package`，再更新本 repo 的 dependency/lockfile。

不要把 `chihhao-api/package.json` 改成 `file:../chihhao-package`，除非使用者明確要求改成本機 workspace/link 開發模式。

更新 package 版本後，必須同時確認：

```sh
node -p "require('./package.json').dependencies['@chihhaocooly/chihhao-package']"
node -p "require('./package-lock.json').packages['node_modules/@chihhaocooly/chihhao-package'].version"
```

`package.json` 的 semver range 不是實際部署版本；正式驗證以 lockfile 解析到的版本為準。

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
