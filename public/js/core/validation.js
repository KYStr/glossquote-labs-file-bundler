export const MAX_FILES = 100;
export const MAX_BYTES = 64 * 1024 * 1024;
const encoder = new TextEncoder();
const codes = ['INVALID_LIMIT', 'NO_FILES', 'TOO_MANY_FILES', 'TOTAL_SIZE_LIMIT', 'INVALID_FILENAME', 'FILENAME_COLLISION', 'FILE_TOO_LARGE', 'BUILD_FAILED'];

export function validLimit(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_BYTES;
}
export function parsePackageLimit(input) {
  const invalid = { ok: false, code: 'INVALID_LIMIT' };
  if (typeof input !== 'string') return invalid;
  const text = input.replace(/^[\u0009-\u000d\u0020]+|[\u0009-\u000d\u0020]+$/g, '');
  const match = /^([0-9]+)(?: *(B|MiB))?$/.exec(text);
  if (!match) return invalid;
  const value = Number(match[1]);
  const bytes = match[2] === 'MiB' ? value * 1048576 : value;
  return validLimit(bytes) && Number.isSafeInteger(value) ? { ok: true, valueBytes: bytes } : invalid;
}

export function validateName(originalName) {
  if (typeof originalName !== 'string' || !originalName.isWellFormed()) return null;
  const name = originalName.normalize('NFC');
  if (!name || name === '.' || name === '..' || /[\/\\:\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(name) || /[\s.]$/u.test(name)) return null;
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) return null;
  const nameUtf8Length = encoder.encode(name).length;
  if (nameUtf8Length > 255) return null;
  return { name, nameUtf8Length, normalizedCollisionKey: name.toLowerCase() };
}

export function validateSelection(files, limitBytes) {
  const errors = new Map();
  const add = (code, indexes = []) => {
    if (!errors.has(code)) errors.set(code, new Set());
    for (const index of indexes) if (Number.isSafeInteger(index) && index >= 0) errors.get(code).add(index);
  };
  if (!validLimit(limitBytes)) add('INVALID_LIMIT');
  if (!Array.isArray(files) || files.length === 0) add('NO_FILES');
  if (Array.isArray(files) && files.length > MAX_FILES) add('TOO_MANY_FILES');
  const validated = [];
  const names = new Map();
  const indexes = new Set();
  let totalBytes = 0;
  for (const item of Array.isArray(files) ? files : []) {
    const index = item?.sourceIndex;
    if (!Number.isSafeInteger(index) || index < 0 || indexes.has(index)) add('BUILD_FAILED', [index]);
    indexes.add(index);
    const size = item?.sizeBytes;
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_BYTES) add('FILE_TOO_LARGE', [index]);
    else totalBytes += size;
    if (!item?.file || typeof item.file.arrayBuffer !== 'function' || item.file.size !== size) add('BUILD_FAILED', [index]);
    const named = validateName(item?.originalName);
    if (!named) add('INVALID_FILENAME', [index]);
    else {
      const group = names.get(named.normalizedCollisionKey) ?? [];
      group.push(index);
      names.set(named.normalizedCollisionKey, group);
      validated.push({ ...item, ...named });
    }
  }
  if (totalBytes > MAX_BYTES) add('TOTAL_SIZE_LIMIT');
  for (const group of names.values()) if (group.length > 1) add('FILENAME_COLLISION', group);
  if (errors.size) return { ok: false, errors: codes.filter(code => errors.has(code)).map(code => ({ code, fileIndexes: [...errors.get(code)].sort((a, b) => a - b) })) };
  return { ok: true, files: validated };
}

export function messageKey(code) {
  const names = { INVALID_LIMIT: 'invalidLimit', NO_FILES: 'noFiles', TOO_MANY_FILES: 'tooManyFiles', TOTAL_SIZE_LIMIT: 'totalSizeLimit', INVALID_FILENAME: 'invalidFilename', FILENAME_COLLISION: 'filenameCollision', FILE_TOO_LARGE: 'fileTooLarge', FILE_TOO_LARGE_FOR_PACKAGE: 'fileTooLargeForPackage', CANCELED: 'canceled', BUILD_FAILED: 'buildFailed' };
  return `error.${names[code] ?? 'buildFailed'}`;
}
export function errorResult(jobId, code, fileIndexes = []) {
  return { schemaVersion: 1, jobId, status: 'error', error: { code, fileIndexes: [...new Set(fileIndexes)].sort((a, b) => a - b), messageKey: messageKey(code) }, packages: [], index: null };
}
