import { serializedZipSize } from './zip-store.js';
import { validLimit, MAX_FILES } from './validation.js';

export function planPackages(files, limitBytes) {
  if (!validLimit(limitBytes) || !Array.isArray(files) || !files.length || files.length > MAX_FILES) throw new Error('BUILD_FAILED');
  const oversized = files.filter(file => serializedZipSize([file]) > limitBytes).map(file => file.sourceIndex).sort((a, b) => a - b);
  if (oversized.length) return { ok: false, code: 'FILE_TOO_LARGE_FOR_PACKAGE', fileIndexes: [...new Set(oversized)] };
  const sorted = [...files].sort((a, b) => b.sizeBytes - a.sizeBytes || a.sourceIndex - b.sourceIndex);
  const packages = [];
  for (const entry of sorted) {
    let target = packages.find(item => serializedZipSize([...item.entries, entry]) <= limitBytes);
    if (!target) {
      target = { fileName: `bundle-${String(packages.length + 1).padStart(3, '0')}.zip`, sizeBytes: 22, entries: [] };
      packages.push(target);
    }
    target.entries.push(entry);
    target.sizeBytes = serializedZipSize(target.entries);
  }
  return { ok: true, packages };
}
