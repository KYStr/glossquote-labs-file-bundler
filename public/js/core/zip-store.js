import { MAX_BYTES, MAX_FILES, validateName } from './validation.js';

const encoder = new TextEncoder();
const U32_MAX = 0xffffffff;
const table = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function fail() { throw new Error('BUILD_FAILED'); }
function crcNumber(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function crc32(bytes) {
  if (!(bytes instanceof Uint8Array)) fail();
  return crcNumber(bytes).toString(16).padStart(8, '0');
}
function metadata(entries) {
  if (!Array.isArray(entries) || entries.length > MAX_FILES) fail();
  const keys = new Set();
  let dataBytes = 0;
  const result = entries.map(entry => {
    const named = validateName(entry?.name);
    if (!named || keys.has(named.normalizedCollisionKey) || !Number.isSafeInteger(entry?.sizeBytes) || entry.sizeBytes < 0 || entry.sizeBytes > MAX_BYTES) fail();
    keys.add(named.normalizedCollisionKey);
    dataBytes += entry.sizeBytes;
    return { ...named, sizeBytes: entry.sizeBytes };
  });
  if (dataBytes > MAX_BYTES) fail();
  return result;
}
export function serializedZipSize(entries) {
  const size = 22 + metadata(entries).reduce((sum, entry) => sum + entry.sizeBytes + 76 + 2 * entry.nameUtf8Length, 0);
  if (!Number.isSafeInteger(size) || size > U32_MAX) fail();
  return size;
}
export async function createStoredZip(entries) {
  if (!Array.isArray(entries) || entries.some(entry => !(entry?.bytes instanceof Uint8Array))) fail();
  const meta = metadata(entries.map(entry => ({ name: entry.name, sizeBytes: entry.bytes.byteLength })));
  const sizeBytes = serializedZipSize(meta);
  const localParts = [];
  const centralParts = [];
  const results = [];
  let localOffset = 0;
  let centralSize = 0;
  for (let i = 0; i < meta.length; i++) {
    const { name, sizeBytes: size } = meta[i];
    const nameBytes = encoder.encode(name);
    const bytes = entries[i].bytes;
    const crc = crcNumber(bytes);
    if (localOffset > U32_MAX) fail();
    const local = new Uint8Array(30);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0x0021, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    localParts.push(local, nameBytes, bytes);

    const central = new Uint8Array(46);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 0x0014, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x0021, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, localOffset, true);
    centralParts.push(central, nameBytes);
    localOffset += 30 + nameBytes.length + size;
    centralSize += 46 + nameBytes.length;
    results.push({ name, sizeBytes: size, crc32: crc.toString(16).padStart(8, '0') });
  }
  if (localOffset > U32_MAX || centralSize > U32_MAX || localOffset + centralSize + 22 !== sizeBytes) fail();
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, meta.length, true);
  ev.setUint16(10, meta.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, localOffset, true);
  ev.setUint16(20, 0, true);
  const blob = new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
  if (blob.size !== sizeBytes) fail();
  return { blob, sizeBytes, entries: results };
}
