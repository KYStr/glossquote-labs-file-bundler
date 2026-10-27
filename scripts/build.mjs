import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { ROOT, PUBLIC_FILES, inspectTree } from './assets.mjs';

const source = join(ROOT, 'public');
const output = join(ROOT, 'dist');
const files = await inspectTree(source);
if (JSON.stringify(files) !== JSON.stringify([...PUBLIC_FILES].sort())) throw new Error('MISSING_ASSET');
await inspectTree(output, false); // Refuse unknown/stale output; never delete it to pass.
for (const file of files) {
  const target = join(output, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(source, file), target);
  if (!(await readFile(target)).equals(await readFile(join(source, file)))) throw new Error('COPY_MISMATCH');
}
process.stdout.write(`BUILD PASS: ${files.length} preview assets; public bytes equal dist.\n`);
