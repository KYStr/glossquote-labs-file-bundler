import assert from 'node:assert/strict';

export function descriptor(sourceIndex, name, bytes = []) {
  const data = Uint8Array.from(bytes);
  const file = new File([data], name);
  return { sourceIndex, file, originalName: name, sizeBytes: data.length };
}
export function sizedDescriptor(sourceIndex, name, size) {
  return { sourceIndex, originalName: name, sizeBytes: size, file: { size, arrayBuffer() { throw new Error('MUST_NOT_READ'); } } };
}
// Independent STORE read-back oracle; no runtime ZIP helpers are imported here.
export function readStoredZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const u16 = offset => view.getUint16(offset, true);
  const u32 = offset => view.getUint32(offset, true);
  const end = bytes.length - 22;
  assert.equal(u32(end), 0x06054b50);
  assert.equal(u16(end + 4), 0);
  assert.equal(u16(end + 6), 0);
  assert.equal(u16(end + 8), u16(end + 10));
  assert.equal(u16(end + 20), 0);
  const count = u16(end + 10);
  const centralOffset = u32(end + 16);
  const centralSize = u32(end + 12);
  assert.equal(centralOffset + centralSize, end);
  let offset = 0;
  const entries = [];
  for (let i = 0; i < count; i++) {
    const localOffset = offset;
    assert.equal(u32(offset), 0x04034b50);
    assert.equal(u16(offset + 4), 20);
    assert.equal(u16(offset + 6), 0x0800);
    assert.equal(u16(offset + 8), 0);
    assert.equal(u16(offset + 10), 0);
    assert.equal(u16(offset + 12), 0x21);
    assert.equal(u16(offset + 28), 0);
    const crc = u32(offset + 14).toString(16).padStart(8, '0');
    const size = u32(offset + 18);
    assert.equal(u32(offset + 22), size);
    const nameLength = u16(offset + 26);
    const nameBytes = bytes.slice(offset + 30, offset + 30 + nameLength);
    const name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
    const dataOffset = offset + 30 + nameLength;
    const data = bytes.slice(dataOffset, dataOffset + size);
    assert.equal(data.length, size);
    entries.push({ name, data, crc32: crc, sizeBytes: size, localOffset, nameBytes });
    offset = dataOffset + size;
  }
  assert.equal(offset, centralOffset);
  for (const entry of entries) {
    assert.equal(u32(offset), 0x02014b50);
    assert.equal(u16(offset + 4), 0x14);
    assert.equal(u16(offset + 6), 20);
    assert.equal(u16(offset + 8), 0x0800);
    assert.equal(u16(offset + 10), 0);
    assert.equal(u16(offset + 12), 0);
    assert.equal(u16(offset + 14), 0x21);
    assert.equal(u32(offset + 16).toString(16).padStart(8, '0'), entry.crc32);
    assert.equal(u32(offset + 20), entry.sizeBytes);
    assert.equal(u32(offset + 24), entry.sizeBytes);
    assert.equal(u16(offset + 28), entry.nameBytes.length);
    for (const delta of [30, 32, 34, 36]) assert.equal(u16(offset + delta), 0);
    assert.equal(u32(offset + 38), 0);
    assert.equal(u32(offset + 42), entry.localOffset);
    assert.deepEqual(bytes.slice(offset + 46, offset + 46 + entry.nameBytes.length), entry.nameBytes);
    offset += 46 + entry.nameBytes.length;
  }
  assert.equal(offset, end);
  return { entries, centralOffset, centralSize };
}
