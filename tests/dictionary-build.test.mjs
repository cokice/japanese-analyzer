import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { readArchive, digest } from '../scripts/dictionary/prepare.mjs';

test('dictionary archive parsing reads JSON as data and rejects corrupt archives', () => {
  assert.throws(() => readArchive(Buffer.from('not gzip')));
  assert.throws(() => readArchive(gzipSync(Buffer.alloc(1024))));
  const content = Buffer.from('{"words":[]}');
  const header = Buffer.alloc(512); header.write('../escape.json'); header.write(content.length.toString(8).padStart(11, '0'), 124);
  const archive = gzipSync(Buffer.concat([header, content, Buffer.alloc(1024)]));
  assert.deepEqual(readArchive(archive), { words: [] }); // No archive paths are written to disk.
  assert.notEqual(digest(archive), digest(Buffer.from('tampered')));
});
test('full English dictionary lock pins a dated asset, digest and stable format', async () => {
  const lock = JSON.parse(await readFile(new URL('../dictionary.lock.json', import.meta.url), 'utf8'));
  assert.match(lock.url, /\/jmdict-eng-[\d.+%B]+\.json\.tgz$/);
  assert.match(lock.sha256, /^[a-f0-9]{64}$/); assert.equal(lock.formatVersion, 1);
  assert.match(lock.date, /^\d{4}-\d{2}-\d{2}$/);
});
