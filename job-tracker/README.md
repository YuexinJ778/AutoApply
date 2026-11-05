# Local Job Tracker

這是一套單機、單使用者、完全在本機執行的求職申請管理工具。它使用 Streamlit 顯示介面，以 JSON、Markdown 與一般檔案保存資料；不需要資料庫、帳號、API server 或網路服務。

## 主要功能

- Dashboard 固定顯示「Offers」、「Rejected」、「Pending」三項即時統計。
- 搜尋、篩選及瀏覽工作總表，可選擇是否顯示封存工作與真實密碼。
- 新增、編輯、封存、取消封存與永久刪除工作。
- Add Job 與 Details 提供獨立、可留白的 Email 欄位，與 Account 分開保存。
- Import JSON 可複製依目前設定產生的空白模板，並一次新增多筆工作。
- 自訂工作狀態；每個狀態都映射到固定的 `offer`、`rejected` 或 `pending` 統計群組。
- 建立 `text`、`date`、`select`、`checkbox` 四種自訂欄位。
- 每筆工作可編輯一份 LaTeX 原始碼、手動編譯 PDF 預覽、保存多個 PDF 版本，並維護一份 Markdown 筆記。
- 每筆工作另有 Files 附件頁籤，可批次上傳、選取即時預覽、下載與確認刪除附件。
- Calendar 整合投遞日期與各工作的 Reminders，提供月／週／清單檢視與 App 內待辦摘要。
- Reminders 可新增、編輯、完成、取消、重新開啟及確認刪除，儲存後直接出現在 Calendar。
- JSON 與文字資料採原子寫入，正式 JSON 覆寫前保留最新一份 `.bak` 備份。
- JSON 損壞時嘗試由備份讀取並在介面顯示警告，不會靜默重設資料。

## 系統需求

- Python 3.10 或更新版本
- 支援 Streamlit 的現代瀏覽器
- 如需編譯 LaTeX，系統必須另外安裝 `pdflatex`；macOS 可安裝 MacTeX 或 BasicTeX

安裝相依套件後，所有功能皆可離線使用。`pdflatex` 不是 Python 套件，無法由 `requirements.txt` 安裝；找不到它時，其他功能仍可使用，但 Compile 會停用。

## 安裝與執行

在本專案資料夾中執行：

```bash
python -m pip install -r requirements.txt
streamlit run app.py
```

第一次啟動時，程式會自動建立資料目錄與預設 JSON 檔案。即使從其他工作目錄啟動 `app.py`，資料仍固定保存在 `app.py` 所在的專案資料夾內。

Calendar 使用已安裝並檢查 API／前端資源的 `streamlit-calendar==1.4.0`。元件的 JavaScript 與 CSS 隨 Python 套件在本機提供，不需要 CDN、外部行事曆帳號或新的前端專案。`tzlocal` 用來取得作業系統的 IANA 時區名稱；`tzdata` 在缺少系統時區資料的平台（例如 Windows）提供 `zoneinfo` 所需資料，避免用固定 UTC offset 推算未來時間。

## 專案結構

```text
job-tracker/
├── app.py
├── storage.py
├── import_jobs.py
├── calendar_utils.py
├── requirements.txt
├── README.md
├── .gitignore
├── .streamlit/
│   └── config.toml
├── data/
│   ├── jobs.json
│   ├── companies.csv
│   └── settings.json
├── applications/
│   └── <job UUID>/
│       ├── resume.tex
│       ├── notes.md
│       ├── reminders.json
│       ├── reminders.json.bak
│       ├── build/
│       │   ├── preview.pdf
│       │   ├── resume.log
│       │   ├── resume.aux
│       │   └── compile_status.json
│       ├── pdfs/
│       │   ├── index.json
│       │   └── <PDF UUID>.pdf
│       └── attachments/
│           ├── index.json
│           ├── index.json.bak
│           └── <file UUID>.<extension>
└── backups/
    ├── jobs.json.bak
    └── settings.json.bak
```

測試集中在 repo 根目錄的 `tests/job-tracker/`。

`data/`、`applications/` 與 `backups/` 都位於 `job-tracker/` 下。每筆工作的附件目錄使用程式產生的 UUID，不使用公司或職缺名稱。

`.streamlit/config.toml` 會停用 Streamlit 使用統計回傳，並只讓服務監聽 `127.0.0.1`，避免把含明文密碼的工具暴露到區域網路。

## Companies：自訂公司欄位

Companies 頂端的 **Add Column** 可新增 Text、Date、Select 或 Checkbox。欄名必填且不可重複；Select 選項一行一個，忽略空白行並保留順序。只有確認 Add Column 才會保存，Cancel 與一般重新執行不會新增欄位。新增後，表格、Add Company 與 Edit Company 立即顯示該欄位。

**Manage Columns** 可選擇自訂欄位，修改欄名、Field Type 或 Select 選項後按 **Save Column**。欄位 ID 與順序保持不變；修改前會檢查所有公司的已保存值，無法轉換的值或仍被使用的待移除選項會阻止保存並顯示公司名稱。空值使用新型別的預設值；Checkbox 改成文字時使用 `true`／`false`。

**Delete Column → Confirm Delete Column** 會刪除欄位定義，以及 CSV 中該欄位與所有公司對應的值；Cancel 不刪除。其他欄位、公司 UUID 與公司紀錄保留。寫入失敗會顯示錯誤；若設定保存失敗，會還原變更前的 CSV。

改欄名會保留公司草稿。改型別或選項會從已保存資料重新載入「該欄位」，請先保存該欄位尚未儲存的輸入；其他公司欄位的草稿保留。

欄位定義保存於 `data/settings.json` 的獨立 `company_columns` 清單，包含程式產生的穩定 `id`、顯示用 `label`、`type` 與 `options`。公司值仍保存於 `data/companies.csv`，每個自訂欄位使用其 ID 作為獨立 CSV 表頭。日期保存為 `YYYY-MM-DD` 或空白，Select 可以未選擇，Checkbox 預設 false。舊公司的 UUID、名稱、日期及已填的自訂值會保留；CSV 仍沿用原子寫入與 `backups/companies.csv.bak`。

Checkbox 寫入 CSV 時統一使用 `true`／`false`。讀取會忽略前後空白及大小寫：`true/1/yes/on` 為 true，空白或 `false/0/no/off` 為 false，其餘值會報錯，不會把字串 `"false"` 當成 true。

公司欄位不會加入 Dashboard、工作 Details 或 Import JSON 模板，也不會改動工作的 `custom_fields`。公司表單的 Today、Clear date 只修改草稿，按 Save 才保存。

2026-09-23 驗證：230 項 unittest 及 21 個 Python 檔案語法檢查通過，所有測試使用隔離資料。Chrome 實測新增 Text 欄位、Add/Edit 顯示、未儲存草稿跨型別切換／Cancel／新增第二欄保留、保存後重載與重新開啟，以及切換公司不混值。Date／Select／Checkbox 的完整保存流程、Today／Clear date／刪除與故障情境由自動測試覆蓋，未逐項重做瀏覽器驗證。正式 `data/` 與 `backups/` 共 20 個檔案的 SHA-256 保持不變。

欄位管理追加驗證：245 項 unittest 與 21 個 Python 檔案語法檢查通過。Chrome 隔離實測改名、Select Yes／No 轉 Checkbox、其他未保存草稿保留、取消刪除、確認刪除及重新載入；亦檢查實際 CSV 的 `true`／`false` 與刪欄結果。其他轉型組合、無效資料拒絕及磁碟錯誤還原由自動測試驗證。正式資料、備份及工作附件共 257 個檔案的 SHA-256 保持不變。

## Import JSON：複製模板與批次新增

1. 從左側導航開啟 **Import JSON**，點 **Generate & Copy JSON Template**，看到 `Copied to clipboard` 後，即可用 Cmd+V／Ctrl+V 貼給 Codex。模板依目前啟用的狀態與自訂欄位產生，沒有既有工作或帳號密碼；**View JSON template** 可展開查看，複製失敗時也可在此手動複製。
2. 請 Codex 填寫 `jobs` 陣列，可包含多筆工作；要求只回傳合法 JSON，不要 Markdown code fence。`company`、`job_title` 必填，`status_id` 必須使用模板列出的 ID；日期使用 `YYYY-MM-DD` 或空字串，checkbox 使用 `true`／`false`，其他未知資訊留白，不猜測投遞日期。可選的 `_help` 只供閱讀，不會存入工作或改動 Settings。
3. 選擇 **Paste JSON** 貼上內容，或 **Upload JSON** 上傳 UTF-8 `.json` 檔案。一次只處理所選來源；確認摘要預覽後，按 **Import N Jobs**。任何一筆驗證失敗時整批不新增，也不建立工作資料夾。
4. 成功後顯示 `Imported N jobs` 並重設輸入，可按 **Back to Dashboard** 返回。原有篩選會保留，因此部分紀錄可能暫時看不到。

匯入只會新增，不更新、不合併、不去重；再次匯入相同資料會建立新的 UUID 紀錄。資料仍存入原本的 `data/jobs.json`，沿用原子寫入與備份，沒有格式遷移或第二份工作資料。投遞日期會依既有 Calendar 邏輯顯示。

**不要把真實帳號、密碼等敏感資訊放進要分享給 Codex 或其他人的 JSON。** 模板中的這些欄位可留空，之後再於 App 內補上。主要使用環境為本機 Chrome；複製功能使用瀏覽器 Clipboard API，不會讀取原有剪貼簿。

## 狀態與 Dashboard 統計

狀態可以在「Settings」頁新增、改名、排序及停用；狀態 ID 建立後不會因改名而改變。Dashboard 無論建立多少狀態，都只會顯示三張統計卡：

- `offer` → Offer
- `rejected` → Rejected
- `pending` → Pending

例如「一面」、「二面」或「等待回覆」都可映射到 `pending`，而不會產生新的統計卡。停用狀態不再出現在新工作選單中，但仍能顯示在既有工作上。

Dashboard 的 **Show saved jobs** 預設關閉，隱藏既有 `planning`（Preparing to Apply）狀態的工作；開啟後將它們納入其他篩選條件的結果。此選擇在同一 session 內保留，包括 Open Job 後返回。Applied、Interview 等其他 Pending 狀態不受此開關影響，也不以投遞日期是否空白判斷。封存的 Saved 工作需同時開啟 Show archived jobs。三張統計卡及 Calendar 沿用原有規則。

### Dashboard 多選刪除

表格左側使用 Streamlit 1.62 原生多列勾選，接著是原有 **Open** 按鈕；勾選不會開啟工作。表格上方依序提供 **Select all**、**Delete selected (N)**、**Clear selection**，並顯示 `Showing M jobs · N selected`。沒有選取時刪除按鈕停用。

**Select all** 選取目前所有 Dashboard 篩選結果，包括捲動範圍外的列；可以再逐筆取消。選取只以 UUID 保存在 session state，普通 rerun、表格排序、Reveal passwords 或切換匯出格式不會清空。Search、Status、Company、Location、Show archived jobs、Show rejected 或 Show saved jobs 改變時，清空選取及待執行的刪除確認。

**Delete selected (N)** 固定當下選取的 UUID，直接在 Dashboard 列出這些工作及筆數；勾選永久刪除確認後執行，或按 Cancel 取消。沿用 `storage.delete_job` 刪除工作與其資料夾、附件及提醒，Calendar 隨重新載入更新。未選取及隱藏工作、其他資料夾、公司資料與全域設定不受影響；備份沿用既有保存行為。部分失敗會列出實際刪除筆數及錯誤，包括紀錄已移除但檔案清理失敗的情況。

### 匯出 Dashboard 結果

勾選只控制刪除，JSON／CSV 仍匯出全部符合 Dashboard 篩選的工作，不含選取狀態。例如篩選 20 筆、勾選 3 筆，匯出仍為 20 筆，刪除只針對那 3 筆。

在表格旁選 **Export format**（預設 CSV，可選 JSON），點 **Prepare download**，再於視窗點 **Download CSV／JSON — N jobs**。準備按鈕會先同步最新搜尋輸入；下載視窗開啟時無法同時編輯篩選，因此不會在搜尋更新前下載上一組資料。沒有結果時顯示 `No jobs to export` 並停用下載。

表格、Open 的 UUID 對應與匯出都來自同一份篩選及程式排序結果，包含所有符合條件的工作，不限於目前捲動可見的列。CSV 和 JSON 沿用表格的內建欄位及 `show_in_table` 自訂欄位、名稱、順序與顯示值，排除 Open、index、內部 UUID、路徑及隱藏欄位。重複欄名沿用含欄位 ID 的唯一名稱。Reveal passwords 關閉時匯出同樣遮蔽；開啟時下載旁會顯示 `Export includes visible passwords.`。

CSV 使用 UTF-8 BOM；JSON 使用 UTF-8 物件陣列並保留中文。檔名含產生日期時間，內容只在記憶體建立，不改動正式資料。這是表格視圖匯出，並非完整備份或 Import JSON 模板。

匯出套用 Dashboard 上方的篩選條件；欄位及順序依 App 的表格設定。Streamlit 1.62 不回傳瀏覽器表格欄頭的臨時排序、工具列搜尋或臨時隱藏欄位，這些操作保留在畫面端，未同步到匯出。

## Calendar 與 Reminders

側邊欄依序為 `Dashboard | Calendar | Settings`。工作頁保留原有功能，頁籤為 `Details | Resume | Markdown Notes | Files | Reminders`。切換 Calendar 或開啟工作不會自動編譯、上傳或儲存履歷；未儲存的 LaTeX 草稿在同一瀏覽器連線內保留。

### 行事曆瀏覽

- Calendar 預設 Month，可切換 Week、List，使用上方 Previous、Next、Today 移動日期，元件標題顯示目前範圍。同日事件過多時可展開更多事件，或點日期查看完整當日清單。
- 投遞事件直接由每筆工作的 `applied_date` 產生，標示 `[Applied]`，是純日期的全天事件。空白不產生事件；無效日期顯示警告；更新日期、清空日期或修改公司／職缺名稱後，Calendar 依最新工作資料更新。沒有另一份投遞事件檔案。
- 提醒使用 Interview、Assessment、Deadline、Follow-up、Other 文字類型標籤。點選事件只顯示詳情，按 Open Job 才依 UUID 開啟所屬工作；提醒會開啟 Reminders 頁籤。詳情顯示工作目前狀態，封存工作另標示 Archived。
- `Show applications`、`Show reminders` 預設開啟，`Show completed/cancelled reminders` 預設關閉。這些只控制顯示，不修改資料，且完全獨立於 Dashboard 的篩選。Calendar 預設包含 Rejected 與 archived 工作的投遞歷史和有效提醒。
- 禁止拖曳改期或拉伸事件。投遞日期請在 Details 修改，提醒日期時間請在 Reminders 修改。

`streamlit-calendar 1.4.0` 沒有 `datesSet` callback，因此日期與檢視由元件外的 Streamlit 控制項及 session state 管理。一般 rerun、篩選與 Refresh 保留目前日期／檢視與元件 key；明確的日期／檢視跳轉或清單事件選取需要重建元件時，會帶回保存的日期與檢視。只處理實際支援的 `dateClick`、`eventClick`，不將元件回傳的事件資料寫入磁碟。每次頁面執行都重新讀取正式資料，不需另按 Sync。

### 新增與管理提醒

在目前工作的 Reminders 填寫 Title、Type、Date、Time 與 IANA Time zone，不需重新選工作。日期旁的 Today 只更新表單草稿並保留其他輸入；只有 Save Reminder 才寫入檔案。時間初始為空，必須明確選擇並勾選確認事件時間與時區，不能自動儲存為午夜。

End date/time、Location or meeting URL、Notes 可留白。若填結束時間，日期和時間必須同時填寫且晚於開始；留白保持 `null`，不自動補時長。Deadline 表示截止點，也不要求結束時間。

提醒清單依時間排序，保留 `scheduled`、`completed`、`cancelled` 紀錄。Edit 保留 reminder UUID；Mark completed、Cancel、Reopen 只變更提醒狀態。Delete Reminder 需勾選確認。View in Calendar 會跳至該提醒日期並顯示詳情，必要時開啟已完成／已取消的顯示開關。封存或拒絕工作不會取消提醒；永久刪除工作時，提醒隨工作資料夾一併刪除。

### 日期、時區與待辦摘要

`applied_date` 始終是 `YYYY-MM-DD`，不轉成 UTC 午夜。提醒則同時保存帶 UTC offset 的 ISO 8601 時間及 IANA 時區名稱，按事件日期的夏令時間規則解析。新增預設使用已確認或可靠偵測的本機時區，編輯保留提醒原時區；無法偵測時，可在 Settings → Time Zone 確認，或在提醒表單輸入並確認。遇到不存在的時間需修改，重複的時間需在「Daylight saving time: repeated hours」明確選第一或第二次。

Calendar 按瀏覽器本機時區顯示，頁面列出顯示時區；日期點擊、當日清單及摘要使用相同時區。App 透過一段內嵌 Streamlit v2 元件讀取瀏覽器 `Intl.DateTimeFormat()` 的 IANA 名稱，不建立前端專案、不讀取其他瀏覽器資料，也不呼叫雲端或 CDN。預約原時區不同時，事件詳情也顯示原始預約時間與時區。

Calendar 的摘要只計入 `scheduled` 提醒，不包含全天投遞紀錄：

- Today：顯示時區的整個今天，包括今日已經過去的時間。
- Upcoming 7 days：明天起至第七天結束的七個日曆日，不重複包含今天。
- Past time, not completed：開始時間嚴格早於現在且仍為 scheduled。今日較早的提醒可同時出現在 Today 與此清單。

摘要依具時區的時間排序，每筆提供 Open Job。進入頁面、儲存提醒後再次顯示頁面、或按 Refresh 時，會按最新資料與目前時間重算並顯示更新時間；沒有每分鐘整頁刷新。時間已過不代表面試失敗或完成，也不會變更工作狀態。

**這是 App 內行事曆與待辦提示，關閉 App 後不會通知。** 本版沒有背景 daemon、cron、APScheduler、系統通知、Email、簡訊、手機推播、Google／Outlook 同步，也沒有只有設定介面卻不執行的通知選項。

### 提醒資料格式

每筆工作的提醒位於 `applications/<job UUID>/reminders.json`，頂層為 `{"schema_version": 1, "reminders": [...]}`。每筆提醒包含：

| 欄位 | 內容 |
| --- | --- |
| `id` | 建立後不變的 reminder UUID |
| `title`、`kind` | 必填標題；`interview`／`assessment`／`deadline`／`follow_up`／`other` |
| `start_at`、`end_at` | 帶 UTC offset 的 ISO 8601；結束可為 `null` |
| `timezone` | IANA 時區名稱 |
| `status` | `scheduled`／`completed`／`cancelled` |
| `location_or_url`、`notes` | 選填文字，預設空字串 |
| `created_at`、`updated_at` | ISO 8601 時間戳記 |

工作歸屬由 UUID 資料夾決定，不重複保存公司、職缺或帳號密碼。UI event id 為 `application:<job UUID>` 與 `reminder:<job UUID>:<reminder UUID>`，不是額外的資料來源。JSON 使用 UTF-8、`ensure_ascii=False`、`indent=2` 及原子寫入。

舊工作缺少提醒檔案視為尚無提醒，不因普通 rerun 建立空檔。覆寫前保留同目錄的 `reminders.json.bak`；主檔損壞時嘗試有效備份並警告，主檔與備份皆無效時停用該工作的提醒編輯，不覆蓋成空白。其他正常工作的 Calendar 事件仍會顯示。

## 履歷與筆記

- Resume 上方可切換 `LaTeX only`、`Compiled preview only`、`Split view`；單一模式使用完整寬度，下方 PDF Library 在三種模式下都保留。
- 從 Dashboard 按 Open 進入工作時預設 `Split view`，一般操作與 rerun 會保留目前模式。未儲存的 LaTeX 草稿依 job UUID 保存在獨立的 session state，隱藏再顯示編輯器也不會遺失；此保護限同一瀏覽器連線，不是跨重啟的自動保存。
- Save、Compile 與 Download .tex 都使用最新草稿。切換模式或附件不會自動儲存、編譯或建立 PDF 版本；若草稿與最後成功預覽不同，會顯示提示。
- 編輯器中的修改不會自動編譯。「Save .tex」只會寫入 `resume.tex`；「Compile」會先儲存目前內容，再於本機執行 `pdflatex`。
- 只有編譯成功才會更新 `build/preview.pdf`。編譯失敗或逾時時，右側仍保留上一次成功的預覽，並可展開查看最新編譯 log。
- Compile 不會自動建立永久版本。「Download Compiled PDF」只下載預覽；「Save to PDF Library」才會把它加入 `pdfs/`。
- PDF Library 可保存多份上傳或編譯而來的 PDF，版本名稱與來源記錄在 `pdfs/index.json`，實體檔案以 UUID 命名，可切換預覽、改名、下載或刪除。
- 舊版本的 `applications/<job UUID>/resume.pdf` 不會遺失；第一次開啟該工作的 PDF Library 時，程式會延遲匯入為 `Imported resume.pdf`，並只搬移一次。
- PDF 與編譯資料只保存在本地，預覽時不會上傳到外部服務。瀏覽器若無法內嵌 PDF，仍可直接下載。
- `notes.md` 使用 UTF-8 保存，編輯器左側輸入、右側以 Streamlit 的安全 Markdown 功能預覽。

## 工作附件

- `Details | Resume | Markdown Notes | Files | Reminders` 的 Files 屬於目前工作，與 Resume 的 PDF Library 完全獨立；上傳 `.tex` 只會成為附件，不會覆寫或編譯履歷。
- 一次可選取多檔，每檔上限 50 MB，按 `Upload & Save` 才保存；成功後清空本批上傳選擇，普通 rerun 不會重複保存。
- 左側以原始檔名與時間顯示清單、內部以 UUID 選取，右側直接更新所選附件的預覽。同名檔案各自保存，不覆蓋。
- 支援本地 PDF、PNG/JPG/JPEG/WEBP、TXT/LOG/TEX、Markdown、CSV 與 JSON 預覽。Markdown 的圖片與 HTML 嵌入停用，不自動載入遠端資源。Office 與其他格式只保存、顯示資訊和下載，不轉檔或執行。
- 文字及 JSON 預覽上限 64 KiB；CSV 最多讀取 256 KiB、展示 200 資料列及 50 欄，每格上限 2,000 字元，畫面會標示部分預覽。不能解碼、損壞、加密或空白檔案會顯示提示，仍可下載原始 bytes。
- `Download Selected File` 使用原始檔名；`Delete Selected File` 必須先勾選確認，只移除目前工作中選取的附件，並自動改選剩餘附件。
- 附件 bytes 不存入 JSON。每個工作的 `attachments/index.json` 獨立保存索引，覆寫前保留最近一份有效的 `index.json.bak`；索引損壞時顯示警告或停止附件操作，不直接重設為空白。僅瀏覽空附件區不建立目錄或索引。

## 備份與還原

每次更新 `data/jobs.json` 或 `data/settings.json` 前，程式會把上一版分別複製成：

- `backups/jobs.json.bak`
- `backups/settings.json.bak`

這兩個檔案只保留最近一次備份，不會產生無限多份。若要備份整套資料，請先停止程式，再複製整個專案資料夾，至少保留 `data/`、`applications/` 與 `backups/`。

若需手動還原 `jobs.json.bak`：

1. 停止 Streamlit。
2. 另外保存目前損壞的 `data/jobs.json`，以免失去鑑識或修復機會。
3. 確認 `backups/jobs.json.bak` 是有效 JSON。
4. 用檔案管理員將它複製到 `data/jobs.json`，覆蓋正式檔案。
5. 重新啟動 Streamlit，確認工作資料正常。

`settings.json.bak` 可用相同方式還原至 `data/settings.json`。

提醒的備份位於各工作的 `applications/<job UUID>/reminders.json.bak`，可在停止程式、另外保存損壞原檔並確認備份有效後，複製回同目錄的 `reminders.json`。備份只保留上一個有效版本，不是完整歷史紀錄；還原可能失去最近一次變更。

## 重要安全警告

本版本會把申請帳號的密碼**以明文直接寫入 `data/jobs.json`**，不加密、不雜湊，也不使用系統 keyring。任何能讀取專案資料夾的人都可能看到密碼。

- 不要將 `data/jobs.json` 上傳到 GitHub 或其他版本控制服務。
- 不要將 `applications/` 上傳到 GitHub，其中可能包含私人履歷與筆記。
- 不要把整個專案資料夾分享給其他人。
- 建議只在你信任且有磁碟加密的個人電腦上使用。
- LaTeX 編譯會在本機執行。程式會禁用 shell escape 並限制執行時間，但這不是完整的作業系統沙盒；只應編譯自己編寫或來源可信的 `.tex` 檔，不要將本工具公開部署。

`.gitignore` 已預設忽略使用者資料，但仍請在每次提交前自行確認。

## 測試

2026-09-22 多選刪除驗證：完整 **187 項 unittest** 通過（含新增 12 項選取／刪除測試），19 個 Python 檔案 `py_compile` 與 `pip check` 通過。隔離測試涵蓋選 3 刪 3、全選 20 取消 2 後刪 18、所有篩選重設選取與確認、排序後 UUID／Open 對應、空結果、取消確認、固定刪除目標、部分失敗、附件及公司／設定資料保留、Calendar 不產生已刪工作事件，以及選 3 筆仍匯出 20 筆 JSON／CSV。

本次 Chrome 使用 `/tmp` 隔離資料實測逐筆多選、全選、取消個別選取、清空選取／停用刪除、公司欄排序、取消確認與實際刪除。20 筆全選後取消兩筆，實際只刪 18 筆及資料夾；其餘 2 筆與 4 筆篩選外工作及原有檔案保持完整，公司資料／設定／既有備份測試檔亦保持不變。刪除後保留搜尋、統計更新，排序後 Open 開啟正確的 Company 04 工作。**未在瀏覽器逐一重測所有篩選組合、故障情境或 CSV／JSON 落地下載內容**；這些由自動測試驗證。所有刪除測試均未使用正式工作資料。

測試只使用臨時目錄，不會修改正式資料。請使用已安裝 `requirements.txt` 的 Python（例如 `.venv/bin/python`），從 repo 根目錄執行；UI 測試使用 Streamlit 原生 AppTest：

```bash
python -m pip install pytest
python -m pytest tests -q
```

Calendar／Reminders 測試涵蓋日期衍生事件、UUID、儲存與備份復原、DST、摘要邊界及 Streamlit 表單／導航；AppTest 不會執行行事曆 iframe 的 JavaScript。實際瀏覽器中的月份切換、日期／事件點擊、資料更新與本機前端資源載入須另做瀏覽器驗證，不能由 Python 測試結果推定。

2026-09-22 Dashboard 驗證：完整 175 項 unittest、18 個 Python 檔案語法檢查及 `pip check` 通過。新增 8 項測試涵蓋 Saved 與其他篩選交集、Open UUID、同 session 選擇、CSV／JSON 與表格一致、45 筆完整匯出、密碼遮蔽、重複欄名、中文／引號／換行／前導零、空結果與資料不變。Chrome 使用隔離資料實測四個開關、搜尋文字輸入後立即 Prepare download（27 筆更新為 1 筆）、Saved＋搜尋＋公司＋地點交集、篩選後 Open 正確工作、返回後保留 Saved 開關，以及空結果停用下載。已點擊 CSV／JSON 下載，但瀏覽器工具的下載事件等待逾時，下載管理頁受工具政策限制；最終落地檔案的瀏覽器端內容驗證尚未完成，不能視為通過。自動測試已解析實際交給 `st.download_button` 的兩種格式內容。正式資料的 255 個檔案 SHA-256 與修改時間全部保持不變，沒有新增或遺失檔案。

2026-09-20 Import JSON 驗證：完整 167 項 unittest 通過（含新增的 27 項匯入測試），17 個 Python 檔案語法檢查通過。Chrome 使用暫存資料，實際點擊複製按鈕並以本機 Cmd+V 貼上，確認完整 3,004 字元模板可解析、與預覽逐字一致，且無既有工作或帳密；另實測三筆工作匯入、輸入清空、Dashboard 統計、保留 Show rejected 關閉及 Open 正確工作。正式資料檔案內容與修改時間保持不變。

2026-09-16 驗證紀錄：完整 140 項 unittest 通過，語法檢查與 `pip check` 通過。Chrome 使用獨立暫存資料，已實測 Month／Week／List、Previous／Next／Today、日期點擊、同日更多事件展開、事件詳情、Open Job、提醒編輯後更新、View in Calendar，以及篩選／Refresh 保留檢視位置；確認 iframe 及其 JavaScript／CSS 從 `127.0.0.1` 的套件資源載入。正式資料的 38 個檔案雜湊比對一致。尚未逐一手動驗證其他瀏覽器／作業系統、DST 表單及斷網運作；DST 與刪除確認已有自動測試覆蓋。

## 已知限制

- 只支援單機、單使用者，不處理多人同時寫入。
- 每份工作只編輯一份 `resume.tex`；不提供多檔案 LaTeX 專案樹、自動編譯、BibTeX、`latexmk` 或多編譯引擎。
- 程式不會自動安裝 TeX 套件；若原始碼使用本機未安裝的套件，編譯會失敗並保留上一次成功的預覽。
- 不驗證職缺網址、不連線到雲端，也不提供 AI、自動投遞或同步功能。提醒只在 App 內顯示，沒有關閉 App 後的通知或背景排程。
- Calendar 第一版不支援循環事件、邀請參加者、拖曳編輯或 ICS 匯入／匯出。
- PDF 是否能直接嵌入顯示取決於瀏覽器；下載功能不受此限制。
