const copy = {
  'zh-Hant': {
    bytes: '位元組', files: '個檔案', remove: '移除', order: '選取順序', affected: '請檢查此檔案', member: '成員', download: '下載', cap: '上限', ready: '分包已備妥，可逐包下載。', selected: '已選取檔案；確認上限後開始分包。', validating: '正在檢查檔案與上限…', planning: '正在計算各包的精確大小…', building: '正在建立 ZIP', idle: '選取檔案以開始。', canceled: '已取消分包。檔案清單已保留，可以重新開始。', cleared: '已清除本頁選檔與產物。已下載的檔案不會刪除。', failed: '未產生分包；請依提示調整後重試。', chosen: '已選', total: '合計', bundleCount: '個 ZIP', start: '開始分包', rebuild: '重新分包', busy: '正在分包…', errors: {
      INVALID_LIMIT: '單包上限需為 1–67,108,864 的整數位元組，或 1–64 的整數 MiB。例：150 B、20 MiB。',
      NO_FILES: '請先選取至少一個一般檔案。', TOO_MANY_FILES: '一次最多 100 個檔案；請移除多餘檔案，或分批選取。', TOTAL_SIZE_LIMIT: '來源檔合計超過 64 MiB；請移除部分檔案後重試。', INVALID_FILENAME: '檔名含不支援的字元、保留名稱，或超過 255 個 UTF-8 位元組。請在原處更名後重新選取。', FILENAME_COLLISION: '檔名正規化後有重複，且不區分大小寫。請更名或移除重複檔案。', FILE_TOO_LARGE: '檔案大小不支援或超過 64 MiB；請改用較小檔案。', FILE_TOO_LARGE_FOR_PACKAGE: '這些檔案加上 ZIP 結構後無法放進空包；請提高單包上限或移除檔案。', BUILD_FAILED: '無法完成建立 ZIP；未保留任何分包。請重試或重新選取一般檔案；需要支援 module Worker 的瀏覽器。'
    }
  },
  en: {
    bytes: 'bytes', files: 'files', remove: 'Remove', order: 'Selection order', affected: 'Check this file', member: 'Members', download: 'Download', cap: 'Limit', ready: 'Bundles are ready. Download each one separately.', selected: 'Files selected. Review the limit, then build bundles.', validating: 'Checking files and limit…', planning: 'Calculating exact bundle sizes…', building: 'Building ZIPs', idle: 'Choose files to begin.', canceled: 'Bundling canceled. The file list is kept so you can try again.', cleared: 'Files and generated results cleared from this page. Downloaded files are kept.', failed: 'No bundles created. Review the messages and try again.', chosen: 'Selected', total: 'Total', bundleCount: 'ZIPs', start: 'Build bundles', rebuild: 'Build again', busy: 'Building bundles…', errors: {
      INVALID_LIMIT: 'Use an integer from 1–67,108,864 in bytes, or 1–64 in MiB. Examples: 150 B, 20 MiB.', NO_FILES: 'Choose at least one regular file first.', TOO_MANY_FILES: 'Choose up to 100 files at a time. Remove extra files or work in batches.', TOTAL_SIZE_LIMIT: 'Source files exceed 64 MiB in total. Remove some files and try again.', INVALID_FILENAME: 'A name contains unsupported characters, a reserved name, or more than 255 UTF-8 bytes. Rename the original and choose it again.', FILENAME_COLLISION: 'Names collide after normalization and case conversion. Rename or remove duplicate files.', FILE_TOO_LARGE: 'A file size is unsupported or exceeds 64 MiB. Choose a smaller file.', FILE_TOO_LARGE_FOR_PACKAGE: 'These files cannot fit an empty ZIP after archive overhead. Increase the limit or remove the files.', BUILD_FAILED: 'ZIP creation failed. No bundles were kept. Try again or reselect regular files. A browser with module Worker support is required.'
    }
  }
};

export function createUI(doc, onRemove) {
  const lang = doc.documentElement.lang === 'en' ? 'en' : 'zh-Hant';
  const t = copy[lang];
  const format = new Intl.NumberFormat(lang === 'en' ? 'en' : 'zh-TW');
  const el = id => doc.getElementById(id);
  const exact = value => `${format.format(value)} ${t.bytes}`;
  function node(tag, text, className) {
    const result = doc.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
  }
  let lastFiles = null;
  let lastErrorKey = '';
  let lastResult = null;
  let lastStatus = '';
  let lastErrorText = '';
  function downloadLink(item) {
    const link = node('a', `${t.download} ${item.fileName}`, 'button download');
    link.href = item.url;
    link.download = item.fileName;
    return link;
  }
  function render(view) {
    const affected = new Set(view.errors.flatMap(error => error.fileIndexes));
    const errorKey = [...affected].join(',');
    if (view.files !== lastFiles || errorKey !== lastErrorKey) {
      lastFiles = view.files;
      lastErrorKey = errorKey;
      const rows = view.files.map(file => {
        const row = node('li', undefined, 'file-row');
        const details = node('div', undefined, 'file-details');
        details.append(node('span', file.originalName, 'file-name'));
        details.append(node('span', `${t.order} #${file.sourceIndex + 1} · ${exact(file.sizeBytes)}`, 'file-meta'));
        if (affected.has(file.sourceIndex)) { row.classList.add('invalid'); details.append(node('span', `! ${t.affected}`, 'file-warning')); }
        const remove = node('button', t.remove, 'quiet');
        remove.type = 'button';
        remove.dataset.sourceIndex = String(file.sourceIndex);
        remove.setAttribute('aria-label', `${t.remove} ${file.originalName}`);
        remove.addEventListener('click', () => onRemove(file.sourceIndex));
        row.append(details, remove);
        return row;
      });
      el('files-list').replaceChildren(...rows);
      el('files-empty').hidden = view.files.length > 0;
    }
    const total = view.files.reduce((sum, file) => sum + file.sizeBytes, 0);
    el('selection-summary').textContent = `${t.chosen} ${format.format(view.files.length)} / 100 ${t.files} · ${t.total} ${exact(total)}`;
    if (el('package-limit').value !== view.limitInput) el('package-limit').value = view.limitInput;
    el('package-limit').setAttribute('aria-invalid', String(view.errors.some(error => error.code === 'INVALID_LIMIT')));
    el('files').setAttribute('aria-invalid', String(view.errors.some(error => error.code !== 'INVALID_LIMIT')));
    const errorMessages = view.errors.map(error => `${t.errors[error.code] ?? t.errors.BUILD_FAILED}${error.fileIndexes.length ? ` (${t.order}: ${error.fileIndexes.map(index => `#${index + 1}`).join(', ')})` : ''}`);
    const errorText = errorMessages.join('\n');
    if (errorText !== lastErrorText) {
      el('errors').replaceChildren(...errorMessages.map(message => node('li', message)));
      lastErrorText = errorText;
    }
    el('error-panel').hidden = !errorMessages.length;
    const busy = ['validating','planning','building'].includes(view.phase);
    el('build').disabled = busy || view.files.length === 0;
    el('build').classList.toggle('primary', !busy && view.phase !== 'ready' && view.files.length > 0);
    el('build').textContent = busy ? t.busy : view.phase === 'ready' ? t.rebuild : t.start;
    el('build').setAttribute('aria-busy', String(busy));
    el('file-control').classList.toggle('primary', view.files.length === 0);
    el('cancel').hidden = !busy;
    el('clear').disabled = !view.files.length && !view.errors.length && view.limitInput === '20 MiB';
    el('progress-area').hidden = !busy;
    el('build-progress').max = view.progress.totalFiles || 1;
    el('build-progress').value = view.progress.completedFiles;
    el('progress-count').textContent = `${format.format(view.progress.completedFiles)} / ${format.format(view.progress.totalFiles)} ${t.files}`;
    el('results').setAttribute('aria-busy', String(busy));
    let status = view.errors.length ? t.failed : view.notice ? t[view.notice] : ({ empty:t.idle, selected:t.selected, validating:t.validating, planning:t.planning, building:t.building, ready:t.ready, cancelled:t.canceled })[view.phase];
    if (view.phase === 'building') status += ` · ${Math.floor(view.progress.completedFiles / 10) * 10} / ${view.progress.totalFiles} ${t.files}`;
    if (status !== lastStatus) { el('status').textContent = status; lastStatus = status; }
    if (view.result !== lastResult) {
      lastResult = view.result;
      const ready = view.phase === 'ready';
      el('results-empty').hidden = ready;
      el('result-summary').textContent = ready ? `${format.format(view.packages.length)} ${t.bundleCount} · ${t.cap} ${exact(view.result.packageLimitBytes)}` : '';
      const cards = ready ? view.packages.map((pkg, number) => {
        const article = node('article', undefined, 'bundle');
        const header = node('div', undefined, 'bundle-header');
        const details = node('div');
        details.append(node('h3', pkg.fileName, 'bundle-name'), node('p', `${exact(pkg.sizeBytes)} / ${exact(view.result.packageLimitBytes)}`, 'archive-size'));
        const link = downloadLink(view.downloads[number]);
        if (number === 0) link.classList.add('primary');
        header.append(details, link);
        const list = node('ul', undefined, 'members');
        list.setAttribute('aria-label', `${pkg.fileName} ${t.member}`);
        for (const entry of pkg.entries) {
          const row = node('li');
          row.append(node('span', entry.name, 'file-name'), node('span', `${exact(entry.sizeBytes)} · CRC32 ${entry.crc32}`, 'file-meta'));
          list.append(row);
        }
        article.append(header, list);
        return article;
      }) : [];
      el('bundles').replaceChildren(...cards);
      el('index-download').replaceChildren(...(ready ? [downloadLink(view.indexDownload)] : []));
      el('ready-note').hidden = !ready;
    }
    return view;
  }
  return { render, el, exact };
}
