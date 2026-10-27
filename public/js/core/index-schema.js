import { serializedZipSize } from './zip-store.js';
import { validLimit, validateName, MAX_BYTES, MAX_FILES } from './validation.js';

export function createIndex(result) {
  const fail = () => { throw new Error('BUILD_FAILED'); };
  if (!validLimit(result?.packageLimitBytes) || !Array.isArray(result.packages) || !result.packages.length || result.packages.length > MAX_FILES) fail();
  const sourceIndexes = new Set();
  const names = new Set();
  let totalBytes = 0;
  const packages = result.packages.map((pkg, number) => {
    if (pkg.fileName !== `bundle-${String(number + 1).padStart(3, '0')}.zip` || !Array.isArray(pkg.entries) || !pkg.entries.length) fail();
    const entries = pkg.entries.map(entry => {
      const named = validateName(entry?.name);
      if (!named || named.name !== entry.name || !Number.isSafeInteger(entry.sourceIndex) || entry.sourceIndex < 0 || sourceIndexes.has(entry.sourceIndex) || names.has(named.normalizedCollisionKey) || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0 || entry.sizeBytes > MAX_BYTES || typeof entry.crc32 !== 'string' || entry.crc32.length !== 8 || !/^[0-9a-f]{8}$/.test(entry.crc32)) fail();
      sourceIndexes.add(entry.sourceIndex);
      names.add(named.normalizedCollisionKey);
      totalBytes += entry.sizeBytes;
      return { sourceIndex: entry.sourceIndex, name: entry.name, sizeBytes: entry.sizeBytes, crc32: entry.crc32 };
    });
    if (!Number.isSafeInteger(pkg.sizeBytes) || pkg.sizeBytes !== serializedZipSize(entries) || pkg.sizeBytes > result.packageLimitBytes) fail();
    return { fileName: pkg.fileName, sizeBytes: pkg.sizeBytes, entries };
  });
  if (sourceIndexes.size > MAX_FILES || totalBytes > MAX_BYTES) fail();
  return { schemaVersion: 1, kind: 'glossquote-file-bundler-index', algorithm: 'stable-ffd-zip-store-v1', packageLimitBytes: result.packageLimitBytes, packages };
}
export function serializeIndex(index) {
  return `${JSON.stringify(createIndex(index), null, 2)}\n`;
}
