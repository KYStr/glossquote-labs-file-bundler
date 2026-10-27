# 技術契約：附件大小分包

## 執行邊界

使用 Node.js 24、ES modules 與瀏覽器原生 API，零外部 runtime/dev dependencies；禁止 npm install。成品是可操作的靜態 candidate。Node 只供開發伺服器、離線 tests、check、build 使用。M1 server 僅綁 127.0.0.1:4227（4180 + 工具 ID 47），只送 public/。M1 預覽頁設 noindex、nofollow、noarchive。file-bundles 是候選 domain，不代表 DNS、部署或公開狀態。

來源內容不得網路傳輸。只可使用使用者選取的 File、輸出 Blob、Worker、URL.createObjectURL 和 URL.revokeObjectURL。禁止 remote fonts、analytics、telemetry、CDN、service worker、server upload、localStorage、IndexedDB、console dump、剪貼簿及自動下載。

## 檔案樹

    package.json
    .gitignore
    public/index.html
    public/en/index.html
    public/css/app.css
    public/js/app.js
    public/js/ui.js
    public/js/bundle-worker.js
    public/js/core/validation.js
    public/js/core/planner.js
    public/js/core/zip-store.js
    public/js/core/index-schema.js
    scripts/serve.mjs
    scripts/check.mjs
    scripts/build.mjs
    test/validation.test.mjs
    test/planner.test.mjs
    test/zip-store.test.mjs
    test/index-schema.test.mjs
    test/state-cleanup.test.mjs

六份規格與共同 docs 唯讀。

## 精確 core 介面

core 純輸入/輸出，失敗回固定 code，不混 DOM：

    parsePackageLimit(input)
      -> { ok: true, valueBytes } | { ok: false, code: "INVALID_LIMIT" }

    validateSelection(files, limitBytes)
      -> { ok: true, files: ValidatedFile[] }
       | { ok: false, errors: [{ code, fileIndexes: number[] }] }

    planPackages(files, limitBytes)
      -> { ok: true, packages: PlannedPackage[] }
       | { ok: false, code: "FILE_TOO_LARGE_FOR_PACKAGE", fileIndexes: number[] }

    serializedZipSize(entries: [{ name, sizeBytes }]) -> number
    createStoredZip(entries: [{ name, bytes: Uint8Array }])
      -> Promise<{ blob: Blob, sizeBytes, entries: EntryResult[] }>
    createIndex(resultWithoutBlob) -> BundleIndexV1

FileDescriptor 為 {sourceIndex, file, originalName, sizeBytes}；ValidatedFile 增 name（NFC archive name）、nameUtf8Length、normalizedCollisionKey。所有 byte 欄位都要是 safe integer。Job v1 的 sourceIndex 在加入佇列時固定；顯示選取清單仍按 sourceIndex。

## 穩定 FFD 分包

1. 驗證上限、空列表、數量、每檔大小、總 bytes、名稱 Unicode/NFC/長度/安全字元和 collision。碰撞鍵為 name.normalize("NFC").toLowerCase()，不依系統 locale。收集能確定的所有錯誤；indexes 去重升序。任何錯誤都不進規劃。
2. 建立排序副本：sizeBytes 大到小，同大小 sourceIndex 小到大。
3. 逐項掃描已建 packages，從第一包起；serializedZipSize(existing + item) <= limitBytes 時放入第一個符合包。空包基數為 22 bytes。
4. 若單項自身 ZIP size 超過上限，回 FILE_TOO_LARGE_FOR_PACKAGE 和所有相關 sourceIndex，不產生輸出。
5. 再算一次每包精確 size，必須等於最後 Blob.size 且 <= 上限。

ZIP 尺寸：空 archive 22 bytes；每 entry 為 local header 30 + central header 46 + UTF-8 filename 在兩處各一次 + data bytes。沒有 extra fields、comment、data descriptor 或 compression stream。這個穩定 FFD 不保證包數最少，也不以檔名重排。

## ZIP STORE writer 與標準

zip-store.js 使用 DataView/Uint8Array 寫 little-endian records。精確欄位如下：local signature 0x04034b50、version needed 20、flags 0x0800、method 0、DOS time 0、DOS date 0x0021、CRC-32、compressed size、uncompressed size、UTF-8 filename length、extra length 0；接著 filename 與 raw bytes。Central signature 0x02014b50、version made by 0x0014、version needed 20、flags 0x0800、method 0、相同 time/date/CRC/sizes、filename length、extra/comment length 0、disk start 0、internal/external attributes 0、local header offset；接著 filename。EOCD signature 0x06054b50，兩個 disk number 0，兩個 entry count 相等，central size/offset 精確，comment length 0。每包單一 disk、compression method 0 (STORE)、general-purpose bit 11 (UTF-8)。UTF-8 名稱先 NFC；沒有 extra field、comments、encryption 或 data descriptor。CRC 初始 FFFFFFFF、反射多項式 EDB88320、最後 XOR FFFFFFFF；呈現八位小寫 hex。每個欄位完整驗證後才建 Blob。

不得生成 Zip64。每包來源最多 64 MiB、100 entries、entry name 至 255 UTF-8 bytes。檢查 archive length、offset 和 entry count 能用 32-bit 表示，否則 BUILD_FAILED 且輸出為零。Tests 必須驗 local/central/EOCD、offset、CRC、store bytes 和 exact Blob.size。

格式參照：PKWARE APPNOTE 6.3.9 的 ZIP records、STORE、CRC-32、UTF-8 bit 11：[PKWARE APPNOTE.TXT](https://www.pkware.com/documents/casestudies/APPNOTE.TXT)。這是格式文件連結；測試使用自製假資料，不執行附件或下載內容。

## Index v1

下載 JSON 的 exact schema：

    {
      "schemaVersion": 1,
      "kind": "glossquote-file-bundler-index",
      "algorithm": "stable-ffd-zip-store-v1",
      "packageLimitBytes": 20971520,
      "packages": [{
        "fileName": "bundle-001.zip",
        "sizeBytes": 109,
        "entries": [{
          "sourceIndex": 0,
          "name": "a.txt",
          "sizeBytes": 1,
          "crc32": "8cdc1683"
        }]
      }]
    }

Package 按 bundle 編號，entries 按該 ZIP 的實際 entry 順序。不准額外 keys。UTF-8 JSON 以 newline 結尾。所有 byte 欄位是 JSON 整數，不轉浮點或字串。

## Worker、狀態和清除

currentJobId 是 UI epoch。狀態：

    empty -> selected -> validating -> planning -> building -> ready
    selected/validating/planning/building -> cancelled -> selected
    validating/planning/building -> error -> selected
    any -> reset -> empty

module Worker 接 {type:"build", jobId, files, packages}，依包內順序讀 File.arrayBuffer()，傳 {type:"progress", jobId, completedFiles, totalFiles}，完成傳 {type:"complete", jobId, packages:[{fileName, bytes, entries}]}。bytes 用 transferable ArrayBuffer。取消由 UI terminate worker。每個 handler 都驗 jobId，舊訊息忽略、不建 URL。讀取錯誤、data length 不符或 Worker error 都報 BUILD_FAILED 並清除全 job 結果。

開始新 job、選取或上限改變、移除、取消、reset、pagehide：遞增 epoch、terminate worker、清除 progress timer、revoke 既有 object URLs、釋放 Blob/bytes/index 引用。Ready 結果沒有時間期限，留在頁面時保持可下載，直到上述清理事件發生。pagehide 同步清除；visibilitychange 不會自動刪 Ready。下載由明確點擊觸發，一個按鈕只觸發一個檔案。

繁中與英文是獨立文件：/index.html 與 /en/index.html。語言選項使用普通 anchor 導頁，不保存或傳遞目前工作；頁面須在連結旁說明未下載結果會遺失。不得用 query/hash/localStorage/sessionStorage 轉移選取檔案或結果。

## Check/build

package.json 為 private ESM，四個 scripts：dev=node scripts/serve.mjs，test=node --test，check=node scripts/check.mjs，build=node scripts/build.mjs。check 驗 noindex、沒有 remote origins/storage，並執行必要 syntax/invariant checks；不可把 regex 當安全證明。build 只把 public/ 複製至 dist/，不複製 inputs、tests、evidence 或 docs。Node tests 使用 memory fake data、不呼叫 network。瀏覽器狀態仍未執行，詳見 ACCEPTANCE.md。
