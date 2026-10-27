// B20-RP-47: reviewed M1 inputs, not a deployment configuration.
export const ORIGIN = 'https://file-bundles.glossquote.com';
export const TOOL_SLUG = 'file-bundler';
// M2A: only these two exact visible labels are removed from formal output.
// Preview public/dist bytes remain pinned below and retain both labels.
export const RELEASE_ONLY_BADGES = Object.freeze({
  'index.html':'<span class="candidate">本機候選版；尚未部署</span>',
  'en/index.html':'<span class="candidate">Local candidate; not deployed</span>'
});
export const M1_SOURCE_SHA256 = 'd5c4a4a622a05040c0ec228323b4c7bb609d7c8aaf46cf61841b780a4284d79f';
export const SERVE_SHA256 = '77ec166f49c51f036d9a029dc05a052cbd8f90121fe1640b8c0a8202efb0f61a';
export const PINNED_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'; connect-src 'none'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const SOURCE_FILES = Object.freeze([
  ['css/app.css', 9767, '53f18d13454c5f478f4a353f7fcfd812ed4e58547833e4c9d1ff3a5aff20cb94'],
  ['en/index.html', 6800, 'e4d348d557f3cbb5b0df03c9ceb24a198d08858ee17e3131be4513c7516be7ca'],
  ['index.html', 6602, '8bcc4ab65f17866f3fe035fb278a6d3870d1a6c48fec9124841adf673db0da04'],
  ['js/app.js', 2117, '088c747984943cb54135ca41cbbe479aedf3c90da3f4067d023258dbfd525c8f'],
  ['js/bundle-worker.js', 2910, 'e4e5ae62a618482511cc0501070ac2e5c3508e4979a35ac8268d7ca617061c74'],
  ['js/core/index-schema.js', 1983, 'df4697abfb9b5e2a894536df582e35951cba073930dfce20fac3e7de0ffb94f3'],
  ['js/core/planner.js', 1108, 'cebd4465d3b2a0c885064706eab6fe36c8595c2e642908d2c1024688b7e83f73'],
  ['js/core/validation.js', 3975, 'ce643be5d07dd9e85eeb548c58ebaad5956f8b7060bb172f8807208e4f676682'],
  ['js/core/zip-store.js', 4240, 'd481552df6d727fe872fa9122b72bd6debc2fa29acf0d787cfc5650ee8f6ae94'],
  ['js/state.js', 7373, 'd597b5e933dc4176134527f5399770b2c2621586208d736739dbd09b37e341d2'],
  ['js/ui.js', 9771, 'e285add4e825966e73aca436590715ed56c6dbc5a832f4b448aac07731776c27']
].map(([path, bytes, sha256]) => Object.freeze({ path, bytes, sha256 })));

// Same six headers as the pinned scripts/serve.mjs handler. Only robots changes.
// The serve module is read and hashed, never imported or started by release code.
export const RELEASE_HEADERS = Object.freeze({
  'Content-Security-Policy': PINNED_CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'index, follow',
  'Cross-Origin-Resource-Policy': 'same-origin'
});
export const PAGE_SEO = Object.freeze({
  'index.html': Object.freeze({lang:'zh-Hant',title:'附件大小分包｜免費本機 ZIP 分包工具',description:'選取最多 100 個檔案，按 ZIP 實際大小分包並下載。檔案只在目前瀏覽器本機處理。',h1:'依附件大小分包'}),
  'en/index.html': Object.freeze({lang:'en',title:'Attachment Size Bundler — Free Local ZIP Splitter',description:'Split up to 100 selected files into ZIP bundles by exact archive size. Files are processed in your browser.',h1:'Bundle files by attachment size'})
});
