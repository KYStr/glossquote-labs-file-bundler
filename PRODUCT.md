# 產品需求：附件大小分包

本文件定義 M1 使用者工作、資料契約和可觀察行為。M1 是完整的本機候選工具：能選檔、估算分包、產生真正可用的 ZIP、下載索引與重新開始。不能以只有分組預覽的 mock 代替 ZIP 產物。

## Job、result、contract、oracle

Job v1 是目前分頁的一次工作，不持久化：

    {
      schemaVersion: 1,
      jobId: "job-1",
      packageLimitBytes: 20971520,
      files: [
        { sourceIndex: 0, file: File, originalName: "report.txt", sizeBytes: 12 }
      ]
    }

sourceIndex 是檔案加入佇列時的零起始順序，檔案不重排此欄位。重選或刪除項目後建立新 jobId。Job 不含路徑、內容字串、帳號或網路識別資料。

成功 Result v1 只在全部 ZIP 產生完成後建立：

    {
      schemaVersion: 1,
      jobId: "job-1",
      status: "ready",
      packageLimitBytes: 20971520,
      packages: [{
        fileName: "bundle-001.zip",
        sizeBytes: 109,
        entries: [{ sourceIndex: 0, name: "a.txt", sizeBytes: 1, crc32: "8cdc1683" }],
        blob: Blob
      }],
      index: {
        schemaVersion: 1,
        kind: "glossquote-file-bundler-index",
        algorithm: "stable-ffd-zip-store-v1",
        packageLimitBytes: 20971520,
        packages: [{
          fileName: "bundle-001.zip",
          sizeBytes: 109,
          entries: [{ sourceIndex: 0, name: "a.txt", sizeBytes: 1, crc32: "8cdc1683" }]
        }]
      }
    }

下載的 JSON 索引只含 index 欄位，不含 Blob、來源路徑或內容。JSON 為 UTF-8、schemaVersion 整數 1；packages 依序編號，entries 按實際 archive entry 順序排列。CRC32 是八位小寫十六進位字串。沒有時間戳或隨機欄位。

錯誤 Result v1 必須全有或全無：

    {
      schemaVersion: 1,
      jobId: "job-1",
      status: "error",
      error: { code: "FILE_TOO_LARGE_FOR_PACKAGE", fileIndexes: [0], messageKey: "error.fileTooLargeForPackage" },
      packages: [],
      index: null
    }

固定錯誤碼：INVALID_LIMIT、NO_FILES、TOO_MANY_FILES、TOTAL_SIZE_LIMIT、INVALID_FILENAME、FILENAME_COLLISION、FILE_TOO_LARGE、FILE_TOO_LARGE_FOR_PACKAGE、CANCELED、BUILD_FAILED。欄位錯誤可列出所有可檢出的 fileIndexes，去重並升序；UI 以 messageKey 提供雙語文案，不把原始內容塞入診斷記錄。CANCELED 是終止狀態，不顯示錯誤 toast。

## 功能需求

**FR-01 選擇本機檔案。** 提供多檔 input 與可選拖放。接受 File.name basename 和原始 bytes，不讀取目錄結構；新增後顯示名稱、大小和選取順序。預設無檔案，空檔案允許。

**FR-02 設定包大小。** 預設 20 MiB，即 20,971,520 bytes。解析前只移除字串首尾 ASCII whitespace；格式為 1 個以上十進位數字，後接可選 ASCII spaces 和精確大小寫單位 B 或 MiB。省略單位等同 B；前導零允許；B 數值以 bytes 解讀，MiB 只接受整數 1–64，1 MiB = 1,048,576 bytes。解析結果必須在 1–67,108,864 bytes。空值、零、負數、千分位、科學記號、小數、非 ASCII 數字、未知或不同大小寫單位、只有單位和超上限均回報 INVALID_LIMIT。例：150 和 150 B 等於 150 bytes；1 MiB 等於 1,048,576 bytes。

**FR-03 驗證選取集合。** 最多 100 個檔案，合計最多 67,108,864 bytes，單檔最多 67,108,864 bytes。basename 經 NFC 後 UTF-8 長度至多 255 bytes。拒絕空名、.、..、斜線或反斜線、冒號、C0/C1 控制字元、雙向覆寫控制字元、不成對 UTF-16 surrogate、尾端空白或句點，以及 Windows 保留裝置名稱 CON、PRN、AUX、NUL、COM1–COM9、LPT1–LPT9（忽略大小寫及第一個句點後的副檔名）。碰撞鍵精確定義為 NFC 後的 JavaScript String.prototype.toLowerCase()；任何相同鍵都拒絕並列出相關 sourceIndex。內容 bytes 不做正規化，保持原樣。

**FR-04 顯示規劃和精確大小。** 使用 stable-ffd-zip-store-v1：依原始檔案 bytes 大小遞減排序，同大小依 sourceIndex 遞增；逐一放入目前已有的第一個可容納包，不能容納才新增包。可容納與否以 TECHNICAL.md 的完整 ZIP STORE serialized size 判定，不以來源大小代替。這是穩定近似法，不承諾最少包數。顯示每包檔名、實際 ZIP bytes、上限與成員。若任一檔案連 ZIP overhead 都放不進空包，顯示該檔並阻止全部輸出。

**FR-05 建立可用 ZIP。** 每張結果卡下載真正的 ZIP STORE archive；entry data 必須逐 byte 等於來源。每包最多 100 entries、64 MiB 來源資料；不輸出 Zip64。名稱為 bundle-NNN.zip，從 001 開始。任何建置失敗都清除所有結果、顯示 BUILD_FAILED，不留下部分成功按鈕。

**FR-06 下載總索引。** Ready 狀態提供 bundle-index.json；格式如上。索引對應實際 ZIP bytes、package name、entries 和 CRC；不得含 full path、檔案內容或額外欄位。

**FR-07 工作狀態與取消。** 狀態依序 empty、selected、validating、planning、building、ready；recoverable error 回 selected，cancelled 回 selected。building 顯示目前檔案數和取消按鈕。取消、清空、移除或更換檔案、改上限、開始另一 job 都遞增 jobId epoch 並終止舊 worker；舊回傳不得改畫面或建立 URL。

**FR-08 清除暫存。** File、Blob、CRC、中間 buffer 只在目前分頁記憶體。重設、取消、來源或上限修改、新工作、pagehide 時移除舊結果並 revoke 每個 object URL。只要使用者留在頁面且未清除或變更來源，Ready 結果持續可下載；不得以計時器自動過期。不得 localStorage、IndexedDB、Cache API、service worker、遠端請求、console 印內容或上傳來源檔。

**FR-09 下載順序。** 不自動連續下載；逐張點包下載，索引另行下載。按鈕名稱用實際檔名。下載只由明確使用者點擊觸發，不自動打開檔案或系統視窗。

**FR-10 雙語頁面導覽。** 繁中版為 /index.html，英文版為 /en/index.html，頁首語言選項是這兩個靜態頁面的普通連結。切換會載入另一頁，因此目前選取檔案、未下載 ZIP 和索引會遺失；連結旁必須明示此事。不得透過 storage、query、hash 或跨頁狀態保存資料。

ZIP STORE 每 entry 固定成本為 76 + 2 × UTF-8 archive name bytes，再加 entry data；每包 EOCD 固定 22 bytes。Archive name 採 NFC。總大小為 22 + Σ(data bytes + 76 + 2×name UTF-8 bytes)。a.txt 加單 byte x 正好 109 bytes、CRC32 8cdc1683；單字元檔名 a、b 各含一 byte，同包正好 180 bytes。完整 oracle 見 ACCEPTANCE.md。
