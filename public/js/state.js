import { parsePackageLimit, validateSelection, errorResult, messageKey } from './core/validation.js';
import { planPackages } from './core/planner.js';
import { createIndex, serializeIndex } from './core/index-schema.js';

export function createBundleController({ workerFactory, urls, onChange = () => {} }) {
  let epoch = 0;
  let files = [];
  let limitInput = '20 MiB';
  let phase = 'empty';
  let errors = [];
  let notice = '';
  let result = null;
  let downloads = [];
  let indexDownload = null;
  let progress = { completedFiles: 0, totalFiles: 0 };
  let worker = null;
  const objectUrls = new Set();
  const currentJobId = () => `job-${epoch}`;
  function snapshot() {
    return { jobId: currentJobId(), phase, files, limitInput, errors, notice, result, packages: result?.packages ?? [], index: result?.index ?? null, downloads, indexDownload, progress };
  }
  const emit = () => onChange(snapshot());
  function stopWorker() {
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    worker = null;
  }
  function releaseResults() {
    for (const url of objectUrls) urls.revokeObjectURL(url);
    objectUrls.clear();
    downloads = [];
    indexDownload = null;
    result = null;
    progress = { completedFiles: 0, totalFiles: 0 };
  }
  function invalidate() {
    epoch++;
    stopWorker();
    releaseResults();
    errors = [];
    notice = '';
  }
  function fail(jobId, allErrors = [{ code: 'BUILD_FAILED', fileIndexes: [] }]) {
    if (jobId !== currentJobId()) return;
    stopWorker();
    releaseResults();
    errors = allErrors.map(error => ({ ...error, messageKey: messageKey(error.code) }));
    result = errorResult(jobId, errors[0].code, errors[0].fileIndexes);
    phase = files.length ? 'selected' : 'empty';
    emit();
  }
  function allocateUrl(blob) {
    const url = urls.createObjectURL(blob);
    objectUrls.add(url);
    return url;
  }
  function selectFiles(selected) {
    invalidate();
    files = Array.from(selected, (file, sourceIndex) => ({ sourceIndex, file, originalName: file.name, sizeBytes: file.size }));
    phase = files.length ? 'selected' : 'empty';
    emit();
  }
  function removeFile(sourceIndex) {
    invalidate();
    files = files.filter(file => file.sourceIndex !== sourceIndex);
    phase = files.length ? 'selected' : 'empty';
    emit();
  }
  function setLimitInput(value) {
    if (value === limitInput) return;
    invalidate();
    limitInput = value;
    phase = files.length ? 'selected' : 'empty';
    emit();
  }
  function reset() {
    invalidate();
    files = [];
    limitInput = '20 MiB';
    phase = 'empty';
    notice = 'cleared';
    emit();
  }
  function cancel() {
    invalidate();
    phase = 'cancelled';
    notice = 'canceled';
    result = errorResult(currentJobId(), 'CANCELED');
    emit();
    phase = files.length ? 'selected' : 'empty';
    emit();
  }
  function rejectSelection() {
    invalidate();
    fail(currentJobId());
  }
  async function start() {
    invalidate();
    const jobId = currentJobId();
    phase = 'validating';
    emit();
    await Promise.resolve();
    if (jobId !== currentJobId()) return;
    const limit = parsePackageLimit(limitInput);
    const validation = validateSelection(files, limit.ok ? limit.valueBytes : NaN);
    if (!validation.ok) { fail(jobId, validation.errors); return; }
    phase = 'planning';
    emit();
    await Promise.resolve();
    if (jobId !== currentJobId()) return;
    try {
      const plan = planPackages(validation.files, limit.valueBytes);
      if (!plan.ok) { fail(jobId, [{ code: plan.code, fileIndexes: plan.fileIndexes }]); return; }
      phase = 'building';
      progress = { completedFiles: 0, totalFiles: files.length };
      emit();
      const ownedWorker = workerFactory();
      worker = ownedWorker;
      const active = data => jobId === currentJobId() && worker === ownedWorker && phase === 'building' && data?.jobId === jobId;
      ownedWorker.onmessage = event => {
        const data = event.data;
        if (!active(data)) return;
        if (data.type === 'progress') {
          if (!Number.isSafeInteger(data.completedFiles) || data.totalFiles !== validation.files.length || data.completedFiles < progress.completedFiles || data.completedFiles > data.totalFiles) { fail(jobId); return; }
          progress = { completedFiles: data.completedFiles, totalFiles: data.totalFiles };
          emit();
          return;
        }
        if (data.type === 'error') { fail(jobId); return; }
        if (data.type !== 'complete') { fail(jobId); return; }
        try {
          if (!Array.isArray(data.packages) || data.packages.length !== plan.packages.length) throw new Error('BUILD_FAILED');
          const packages = data.packages.map((pkg, number) => {
            const planned = plan.packages[number];
            if (pkg.fileName !== planned.fileName || !(pkg.bytes instanceof ArrayBuffer) || pkg.bytes.byteLength !== planned.sizeBytes || !Array.isArray(pkg.entries) || pkg.entries.length !== planned.entries.length) throw new Error('BUILD_FAILED');
            const entries = pkg.entries.map((entry, i) => {
              const expected = planned.entries[i];
              if (entry.sourceIndex !== expected.sourceIndex || entry.name !== expected.name || entry.sizeBytes !== expected.sizeBytes) throw new Error('BUILD_FAILED');
              return { sourceIndex: entry.sourceIndex, name: entry.name, sizeBytes: entry.sizeBytes, crc32: entry.crc32 };
            });
            const blob = new Blob([pkg.bytes], { type: 'application/zip' });
            if (blob.size !== planned.sizeBytes || blob.size > limit.valueBytes) throw new Error('BUILD_FAILED');
            return { fileName: pkg.fileName, sizeBytes: blob.size, entries, blob };
          });
          const index = createIndex({ packageLimitBytes: limit.valueBytes, packages });
          const indexBlob = new Blob([serializeIndex(index)], { type: 'application/json;charset=utf-8' });
          const readyDownloads = packages.map(pkg => ({ fileName: pkg.fileName, url: allocateUrl(pkg.blob) }));
          const readyIndex = { fileName: 'bundle-index.json', url: allocateUrl(indexBlob) };
          stopWorker();
          result = { schemaVersion: 1, jobId, status: 'ready', packageLimitBytes: limit.valueBytes, packages, index };
          downloads = readyDownloads;
          indexDownload = readyIndex;
          progress = { completedFiles: files.length, totalFiles: files.length };
          phase = 'ready';
          emit();
        } catch { fail(jobId); }
      };
      ownedWorker.onerror = event => {
        event?.preventDefault?.();
        if (jobId === currentJobId() && worker === ownedWorker) fail(jobId);
      };
      ownedWorker.onmessageerror = () => {
        if (jobId === currentJobId() && worker === ownedWorker) fail(jobId);
      };
      ownedWorker.postMessage({ type: 'build', jobId, files: validation.files, packages: plan.packages.map(pkg => ({ fileName: pkg.fileName, sizeBytes: pkg.sizeBytes, entries: pkg.entries.map(entry => ({ sourceIndex: entry.sourceIndex, name: entry.name, sizeBytes: entry.sizeBytes })) })) });
    } catch { fail(jobId); }
  }
  return { snapshot, selectFiles, removeFile, setLimitInput, start, cancel, reset, pagehide: reset, rejectSelection };
}
