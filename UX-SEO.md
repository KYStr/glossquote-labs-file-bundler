# UX 與 SEO：附件大小分包

## 雙語文案與語言狀態

候選 slug file-bundler；候選 domain file-bundles 只供主代理評估。M1 HTML 必須 noindex,nofollow,noarchive；沒有已驗證網域的 canonical。

| 欄位 | 繁體中文 | English |
|---|---|---|
| Title | 附件大小分包｜免費本機 ZIP 分包工具 | Attachment Size Bundler — Free Local ZIP Splitter |
| Description | 選取最多 100 個檔案，按 ZIP 實際大小分包並下載。檔案只在目前瀏覽器本機處理。 | Split up to 100 selected files into ZIP bundles by exact archive size. Files are processed in your browser. |
| H1 | 依附件大小分包 | Bundle files by attachment size |
| 短說明 | 設定單包上限，確認每個 ZIP 的實際大小，再逐包下載。 | Set a per-ZIP limit, review each archive’s exact size, then download bundles one at a time. |
| Primary action | 選取檔案 | Choose files |
| Secondary action | 清除全部 | Clear all |
| Candidate status | 本機候選版；尚未部署 | Local candidate; not deployed |

繁中位於 /index.html，English 位於 /en/index.html。頁首以普通 anchor 連往另一語言頁面；切頁會載入新文件並失去目前 memory-only 的選檔、limit 和尚未下載結果。語言連結旁固定顯示警語：「切換語言會離開此頁；未下載的分包和索引會遺失。」英文：「Changing language leaves this page. Selected files and undownloaded bundles will be lost.」不保存或搬移輸入。各頁所有狀態、錯誤、說明、檔案數量與單位都用該頁語言。使用者檔名以文字節點顯示，不作 HTML。

## 工作區線框

桌面寬版（>=75rem）讓工作區佔主要視覺面積。左側選檔與結果，右側限制和主動作；不放 marketing hero：

    ┌ 品牌 | 附件大小分包 | 語言 ───────────────────────┐
    │ H1：依附件大小分包 / Bundle files by size          │
    │ 設定上限、逐包下載 / Set a cap, download each ZIP   │
    ├────────────────────────────┬───────────────────────┤
    │ [選取檔案] [拖放檔案]       │ 單包上限 [20 MiB]     │
    │ 已選檔案清單                │ 最多 100 檔 / 64 MiB │
    │ 名稱 | bytes | 移除         │ [開始分包]           │
    ├────────────────────────────┴───────────────────────┤
    │ bundle-001.zip | 實際大小 / 上限 | [下載這一包]     │
    │ bundle-002.zip | 成員清單         | [下載這一包]     │
    │ [下載 bundle-index.json] [重新開始]                 │
    └────────────────────────────────────────────────────┘

中版（48rem–74.999rem）改單欄：選檔與清單在上，限制與主動作緊鄰清單，結果卡在下。窄版（<48rem）所有欄位單欄，主要 action 可置底，但不能遮焦點、錯誤或虛擬鍵盤。

    ┌ 品牌 | 工具 | 語言 ┐
    │ H1 / 一句說明       │
    │ [選取檔案]          │
    │ 已選 2 / 100 | 1.4 MiB │
    │ report.txt 12 KiB [移除] │
    │ photo.jpg 1.3 MiB [移除] │
    │ 單包上限 [20 MiB]  │
    │ [開始分包]          │
    │ 進度 / [取消]       │
    │ ZIP 結果卡與逐包下載 │
    │ [下載索引] [重新開始] │
    └─────────────────────┘

## 互動與可及性

empty 提供選檔按鈕，拖放只是替代方式。selected 顯示檔數、總 bytes、每項大小與移除。validating/planning 顯示階段。building 顯示完成檔數與取消。ready 顯示 ZIP 實際 bytes、上限、成員名、逐包下載和獨立 index 下載；結果持續到使用者清除、來源/上限變更、新工作或離頁。error 說明原因並標出受影響檔案；cancelled 保留輸入且可重試；reset 回 empty。狀態文字不能只用顏色表示。

使用原生 label、input、button；Tab 次序按工作流。focus-visible 使用清楚的 3px ring；進度/錯誤/成功透過適當 live region，避免逐項重複朗讀。可點目標至少 44×44 CSS px。依 docs/DESIGN-SYSTEM.md 對比和設計 token。320px 不水平捲動；200% zoom 可以完成所有動作；尊重 prefers-reduced-motion。最多 100 檔的清單可內捲但不重設頁面焦點。窄版固定 action 在虛擬鍵盤開啟時不可蓋住輸入或錯誤。

## FAQ

繁體中文：
1. **檔案會上傳嗎？** 不會。候選版在目前瀏覽器分頁處理所選檔案，沒有帳號或上傳功能。
2. **ZIP 會符合上限嗎？** 工具按 ZIP STORE 實際 bytes 計算和驗證。郵件服務可能另加傳輸編碼，請依收件端規則留空間。
3. **為什麼分成多包？** 穩定 first-fit-decreasing 會計入每包 ZIP overhead，但不保證包數最少。
4. **可以取消或重新選檔嗎？** 可以。取消、移除、更改上限或重新選檔都會清除舊結果和暫存 URL。
5. **來源檔會被修改嗎？** 不會。內容 bytes 保持不變；ZIP entry 名稱會正規化為 NFC。

English:
1. **Are my files uploaded?** No. The candidate processes selected files in the current browser tab and has no account or upload feature.
2. **Will ZIPs meet the limit?** The tool measures actual ZIP STORE bytes. Mail services may add transfer encoding, so leave room for their rules.
3. **Why are there multiple bundles?** Stable first-fit-decreasing accounts for ZIP overhead but does not promise the fewest bundles.
4. **Can I cancel or choose files again?** Yes. Canceling, removing files, changing the limit, or starting over clears old results and temporary URLs.
5. **Are my originals changed?** No. Content bytes remain unchanged; ZIP entry names are normalized to NFC.

## 發布說明

不加入虛構評分、使用者數、背書或已部署聲明。M1 是 noindex local candidate。公開 GitHub、免費 hosting、實際 domain 與首頁納入均由 parent 在 M2 門檻後決定；本規格不授權發布。
