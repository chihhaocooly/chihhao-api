# 會員身份與問卷聯動上線說明

## 版本與目前狀態

- 共用套件：`@chihhaocooly/chihhao-package@1.0.35`，commit `fa96ef4`，tag `1.0.35`。
- 發布：[GitHub Actions 34292223727](https://github.com/chihhaocooly/chihhao-package/actions/runs/34292223727)，單元與隔離 MySQL 測試通過後發布。
- API：package.json `^1.0.35`、package-lock.json `1.0.35`，正式 registry 安裝；沒有使用本機 link。
- 程式碼完成本機驗證。2026-09-09 已取得 migration 與三個應用部署授權，發布結果見下方紀錄。Cloud Scheduler 不建立。

## 發布順序

1. 完成四 repo 的驗證與變更審查。
2. 經授權後，先依 package 流程 `migration:show` 確認目標，再執行 additive migration `1795100000000-AddMemberIdentityAndProfileLinkage`；再次 show 確認。不可對已有會員資料的 DB 自動 down。
3. 先發布帶 Firebase LINE ID token、requestId、surveyVersion 的 LIFF。一般問卷 payload 保持舊 API 能接受的欄位；新 `/member` 入口在 API 升級前會顯示載入錯誤，不繞過認證。
4. 透過版本 tag 發布新版 API；`/survey/*` 開始強制 LINE Firebase claims，舊匿名客戶端會收到 401。
5. 透過版本 tag 發布後台，再設定身份、啟用需要的會員欄位、設定問卷綁定及預設入口。
6. Demo 不需建立 Scheduler：身份切換、問卷身份異動、follow 與人工重試會在提交後立即嘗試同步。需要自動補償失敗時，才啟用下述可選 Scheduler。
7. 使用測試 OA／測試會員驗證金銀卡切換、個人選單解除、非好友再 follow、選單失敗與重試後，再啟用實際會員流程。

## 2026-09-09 發布紀錄

- 已依使用者授權執行會員 migration；既有帳號缺少獨立 CREATE INDEX 權限，先以現有 ALTER TABLE 權限建立 migration 定義的兩個索引，再重跑 migration。沒有變更帳號權限或刪除資料。
- 新環境若有相同權限限制，可先以 ALTER TABLE ADD INDEX 建立 `line_member` 的 `idx_line_member_sub_identity(subIdentityId,id)` 與 `survey_report` 的 `idx_survey_report_member_submitted(lineUserId,submittedAt,reportKey)`，再重跑；執行前須檢查索引是否已存在。
- 預定版本：API `s1.0.58`、後台 `1.0.35`、LIFF `0.1.7`，均透過版本 tag 觸發 CI/CD。Package 維持 `1.0.35`。
- 後台設定與真實 LINE 流程由使用者測試。

## 操作觸發同步與可選 Cloud Scheduler

單人操作只處理該會員；子身份更換選單則處理該身份至多 50 位，45 秒後停止取下一位。LINE 呼叫在交易提交後執行並 await 到 API 回應前；沒有常駐 timer 或 response 後背景工作。每個 HTTP timeout 10 秒，快速切換最多處理 3 個 generation。大量會員超出批次、程序中斷、LINE 失敗或 lease 尚未到期時，待辦會保留；未啟用 Scheduler 時由後台會員詳情「重試同步」處理，不會自行按退避時間喚醒 Cloud Run。

身份與問卷 response 的 `menuSyncStatus` 是防重送保存的交易快照；實際同步結果由 GET membership 查詢，後台既有流程會重新載入。重送相同 requestId 不再觸發同步；人工 retry 回傳同步嘗試後狀態。同步失敗不影響已提交的身份及問卷。

以下排程只在需要自動補償時設定；Demo 可以省略兩個 MEMBER_MENU_SYNC 環境變數，內部 endpoint 會保持停用。

API 環境變數：

- `LIFF_SITE=chihhao`：必須與 LIFF 登入取得的 LINE Firebase claims 站台相同。
- `MEMBER_MENU_SYNC_AUDIENCE`：設定為排程驗證的固定 audience，建議完整的 `https://<API_HOST>/internal/member-menu-sync/process`。
- `MEMBER_MENU_SYNC_SERVICE_ACCOUNT`：專門用於此排程的 service account email。

Scheduler job 設定：

- 每分鐘 `* * * * *`，時區 `Asia/Taipei`。
- HTTP `POST https://<API_HOST>/internal/member-menu-sync/process`，body `{}`。
- 使用 Google OIDC ID token；service account 與 audience 必須精確對應以上設定。
- 執行者／排程服務須具備產生該 service account OIDC token 的 IAM 權限；如 Cloud Run 改為私有，另授予該 service account Cloud Run Invoker。
- 建議 HTTP deadline 180 秒。每次最多掃描 50 位，45 秒後停止取下一位；正在處理的圖片發布或 LINE 請求完成後結束。LINE HTTP timeout 為 10 秒，個人綁定 lease 120 秒。
- Endpoint 驗證簽章、audience、Google issuer、email 與 email_verified，不能以後台 Firebase token 呼叫。

選單發布在取得會員 lease 前完成；綁定前重新確認 generation。個人目標更新與資料變更同交易，LINE 呼叫在交易外。啟用 Scheduler 時，暫時錯誤依 1／5／15／60 分鐘退避，第 5 次失敗標記 failed；非好友 waiting-friend；follow 與後台重試會重設待辦並立即嘗試。

## API 與資料維護

- 管理設定 `/admin/member-identities`、`/admin/member-fields`、`/admin/member-forms`，admin／manager 寫入，viewer 唯讀。
- `GET /line-members/:id/membership` 提供身份、版本、欄位與同步狀態；主列表接受 `identityId` 或 `subIdentityId`（`none` 代表無身份），回傳 membership、menuSyncStatus。
- `POST /line-members/:id/identity-transitions`：`{subIdentityId:null|string,expectedVersion,requestId,reason?}`。
- `PATCH /line-members/:id/profile`：`{expectedVersion,requestId,values:[{fieldId,value}]}`。只有此 endpoint 的明確 null 會清除會員欄位。
- `GET /line-members/:id/changes`、`GET /line-members/:id/survey-reports` 以 page／pageSize 分頁；`POST /line-members/:id/rich-menu-sync/retry` 重排目前目標並立即嘗試同步。
- `GET /survey/member-default`、`GET /survey/member-regions` 需要 LINE Firebase auth。
- `/survey/submit` 必帶 `surveyVersion`、`requestId`；呼叫端 userId 不作為本人依據。重試相同內容使用相同 requestId；改答案需新 requestId；409 需使用者確認新版問卷。
- 設定與會員交易先取得 `member_settings(1)` 鎖，再鎖問卷、會員。這是第一版刻意使用的全域交易序列化，可避免無 foreign key 的引用競爭；若流量提升，應量測鎖等待後再改為細粒度鎖。
- 圖文選單被子身份引用時不可直接改內容或刪除。先複製選單、更新子身份綁定。改動尚未被引用的選單會清除舊 LINE id，之後重新發布，避免使用過期内容。
- 新報表用提交快照（含會員選項名稱）顯示；舊報表使用現有題目 fallback。欄位定義修改會增加引用問卷版本。

## 台灣行政區資料

`src/functions/membership/taiwan-regions.json` 為 2026-09-09 下載的版本，包含 22 縣市、368 鄉鎮市區。
來源：[國土測繪中心縣市清單](https://api.nlsc.gov.tw/other/ListCounty)、[戶政鄉鎮市區清單範例](https://api.nlsc.gov.tw/other/ListTown1/A)。
縣市採 countycode01、行政區採 towncode；名稱由 API 的版本化資料決定。郵遞區號僅驗證 3／6 碼，沒有地址投遞、手機 OTP、Email 持有人驗證。

## 驗證與限制

- `npm run build`：API 型別檢查與編譯。
- `npm test -- --runInBand`：輸入驗證、LINE claims、管理 route 角色、既有功能回歸。
- `npm run test:membership`：自行建立 localhost、隨機 port 的 MySQL 8.4 container，僅使用測試資料；不讀正式 DB 連線設定，結束刪除 container。驗證來源不符但更新欄位、防重送、版本衝突、快照、並發、LINE 模擬失敗及恢復。
- UI 使用實際元件與本機 API／登入替身驗證 1280px／390px，不等同正式站登入或真實 OA 驗證。
- npm install 回報既有依賴弱點清單；本次未進行跨版本依賴全面升級。
