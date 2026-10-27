import { validateSelection, errorResult } from './core/validation.js';
import { planPackages } from './core/planner.js';
import { createStoredZip } from './core/zip-store.js';

function planShape(packages) {
  return packages.map(pkg => ({ fileName: pkg.fileName, sizeBytes: pkg.sizeBytes, entries: pkg.entries.map(entry => ({ sourceIndex: entry.sourceIndex, name: entry.name, sizeBytes: entry.sizeBytes })) }));
}
export async function buildWorkerJob(message, emit) {
  const jobId = message?.jobId;
  try {
    if (message?.type !== 'build' || typeof jobId !== 'string' || jobId.trim() !== jobId || !/^job-[0-9]+$/.test(jobId) || !Array.isArray(message.packages) || Object.keys(message).sort().join(',') !== 'files,jobId,packages,type') throw new Error('BUILD_FAILED');
    // The cap is encoded by the plan. Selection limits are checked again before any file read.
    const validation = validateSelection(message.files, 64 * 1048576);
    if (!validation.ok) throw new Error('BUILD_FAILED');
    const cap = Math.max(...message.packages.map(pkg => pkg.sizeBytes));
    const canonical = planPackages(validation.files, cap);
    if (!canonical.ok || JSON.stringify(planShape(canonical.packages)) !== JSON.stringify(planShape(message.packages))) throw new Error('BUILD_FAILED');
    const byIndex = new Map(validation.files.map(file => [file.sourceIndex, file]));
    const packages = [];
    let completedFiles = 0;
    for (const pkg of message.packages) {
      const inputs = [];
      for (const entry of pkg.entries) {
        const descriptor = byIndex.get(entry.sourceIndex);
        if (!descriptor || descriptor.name !== entry.name || descriptor.sizeBytes !== entry.sizeBytes) throw new Error('BUILD_FAILED');
        const buffer = await descriptor.file.arrayBuffer();
        if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== descriptor.sizeBytes) throw new Error('BUILD_FAILED');
        inputs.push({ name: descriptor.name, bytes: new Uint8Array(buffer) });
        emit({ type: 'progress', jobId, completedFiles: ++completedFiles, totalFiles: validation.files.length });
      }
      const archive = await createStoredZip(inputs);
      if (archive.sizeBytes !== pkg.sizeBytes) throw new Error('BUILD_FAILED');
      const bytes = await archive.blob.arrayBuffer();
      const entries = archive.entries.map((entry, i) => ({ sourceIndex: pkg.entries[i].sourceIndex, ...entry }));
      packages.push({ fileName: pkg.fileName, bytes, entries });
    }
    emit({ type: 'complete', jobId, packages }, packages.map(pkg => pkg.bytes));
  } catch {
    emit({ type: 'error', jobId, result: errorResult(jobId, 'BUILD_FAILED') });
  }
}
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') {
  self.onmessage = event => {
    void buildWorkerJob(event.data, (message, transfer = []) => self.postMessage(message, transfer));
  };
}
