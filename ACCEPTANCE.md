# 驗收 oracle：附件大小分包

## 狀態

這是 M1 必須實作的 oracle；規格作者沒有執行產品、Node tests、build 或瀏覽器。全表現況為 **NOT_RUN_SPEC_ONLY**。真實瀏覽器、檔案選擇器、下載、鍵盤、320px reflow 和 200% zoom 項目標 **NOT_RUN_USER_FOCUS_INCIDENT**，不可用 Node 或靜態 DOM 代替 browser PASS。自動測試只用 memory 合成 bytes。

| ID | FR | 輸入 | 精確 oracle |
|---|---|---|---|
| B47-01 | FR-02 | limit 為 150 | 解析成功，valueBytes=150。 |
| B47-02 | FR-02 | limit 為 20 MiB | 解析成功，valueBytes=20,971,520。 |
| B47-03 | FR-02 | 0、-1、1.5 MiB、1e3、65 MiB、空字串 | 每項 INVALID_LIMIT，packages=[]，index=null。 |
| B47-04 | FR-01,03,05 | 空內容檔名 a，cap=100 | 成功；ZIP size=100；entry size=0、CRC32=00000000。 |
| B47-05 | FR-03,05 | a.txt，內容 ASCII x（hex 78），cap=150 | bundle-001.zip；size=109；entry CRC32=8cdc1683；解開 bytes=[0x78]。 |
| B47-06 | FR-03,04 | a.txt，內容 x，cap=108 | FILE_TOO_LARGE_FOR_PACKAGE；fileIndexes=[0]；packages=[]；index=null。 |
| B47-07 | FR-04 | a 和 b 各一個 data byte，cap=179 | 兩包；同大小時 sourceIndex 順序；每包 size=101，均 <=179。 |
| B47-08 | FR-04,05 | a 和 b 各一 byte，cap=180 | 一包，ZIP size=180；2 entries；解壓兩個 bytes 逐 byte 對應來源。 |
| B47-09 | FR-03 | 101 個唯一合法名的空檔 | TOO_MANY_FILES；無 ZIP、無索引。 |
| B47-10 | FR-03 | 單檔 descriptor size=67,108,865 | FILE_TOO_LARGE；不讀取內容、不規劃。 |
| B47-11 | FR-03 | 64 個檔案各 1 MiB，再加 1 byte | TOTAL_SIZE_LIMIT；整批不輸出。 |
| B47-12 | FR-03 | 名稱 ../evil.txt | INVALID_FILENAME，列 sourceIndex，零輸出。 |
| B47-13 | FR-03 | CON.txt、a. | INVALID_FILENAME；拒絕裝置保留名和尾端句點。 |
| B47-14 | FR-03 | é.txt 與 e + U+0301 + .txt | FILENAME_COLLISION，兩個 sourceIndex 升序，零輸出。 |
| B47-15 | FR-03 | A.txt 與 a.TXT | FILENAME_COLLISION；NFC 後大小寫不敏感。 |
| B47-16 | FR-03,05 | entry a，data=[00,FF,7F] | ZIP STORE 解壓 bytes 精確 [00,FF,7F]；無文字解碼/換行變更。 |
| B47-17 | FR-05 | B47-05 archive bytes | local method=0；flag 11 set；CRC=8cdc1683；central offset 正確；EOCD entries=1；總長=109。 |
| B47-18 | FR-06 | B47-05 index | schemaVersion=1、limit=150；一包 bundle-001.zip size=109；entry=(0,a.txt,1,8cdc1683)；沒有額外 keys。 |
| B47-19 | FR-04 | source 0 是 2-byte x，source 1 是 3-byte y，cap=300 | plan 先處理 source 1，再 source 0；同包時 entries 順序為 [1,0]；UI source list 仍為 [0,1]。 |
| B47-20 | FR-07 | job A build，取消後 job B，最後延遲送達 A complete | A event 忽略；不建 object URL；B 狀態不變；A worker terminate。 |
| B47-21 | FR-08 | Ready 後 reset | 每個 URL 恰好 revoke 一次；packages=[]、index=null、state=empty。 |
| B47-22 | FR-08 | Ready 結果，fake clock 前進 20 分鐘且沒有 user action | 不設自動過期 timer；state 仍 ready、URL 未 revoke、下載仍有效。 |
| B47-23 | FR-09 | Ready 有三包 | 不自動觸發 download；每次按鈕只下載一個指定 ZIP；index 由獨立按鈕下載。 |
| B47-24 | FR-05 | worker bytes 長度與宣告 source size 不同 | BUILD_FAILED；packages=[]、index=null；沒有部分成功按鈕。 |

B47-01–18、20–22、24 用 Node 24 node:test 純 core 或 worker protocol 測試。B47-17 必須解析 local/central/EOCD 與 offset，不可只查 ZIP magic；測試 helper 解回 STORE bytes 再比對原始 fixture。B47-19 另測第一個可容納包與等大 sourceIndex tie-break。名稱安全測試另涵蓋 C0/C1、slash/backslash、冒號、bidi override、不成對 surrogate、255/256 UTF-8 byte 邊界和錯誤集合零輸出。

## 瀏覽器與人工項目

**全部 NOT_RUN_USER_FOCUS_INCIDENT。** 不操作使用者桌面、互動本機瀏覽器/IAB、焦點、IME、clipboard 或 OS dialogs。等 parent 提供已審核隔離方式後，才可另行執行 browser gates。必要項目包括選檔和拖放、點語言連結前 warning 可見、/en/index.html 導頁後輸入不跨頁保存、Tab/focus、live error、320px 無水平捲動、200% zoom、逐包下載、索引下載、reset/cancel。觸發 file picker、print/save dialogs 的檢查維持 NOT_RUN。
