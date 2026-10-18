import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChunkedDownloader } from '../src/services/chunkedDownloader.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it('merges many parts in order and removes them after completion', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asspp-merge-'));
  dirs.push(dir);
  const dest = path.join(dir, 'app.ipa');
  const parts = Array.from({ length: 32 }, (_, i) => Buffer.alloc(65536, i));
  parts.forEach((part, i) => fs.writeFileSync(`${dest}.part${i}`, part));
  const downloader = new ChunkedDownloader('https://example.invalid', dest);
  await downloader['mergeChunks'](parts.length);
  expect(fs.readFileSync(dest)).toEqual(Buffer.concat(parts));
  expect(fs.readdirSync(dir)).toEqual(['app.ipa']);
});

it('rejects a missing part and retains source parts for cleanup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asspp-merge-'));
  dirs.push(dir);
  const dest = path.join(dir, 'app.ipa');
  fs.writeFileSync(`${dest}.part0`, 'first');
  const downloader = new ChunkedDownloader('https://example.invalid', dest);
  await expect(downloader['mergeChunks'](2)).rejects.toThrow();
  expect(fs.existsSync(`${dest}.part0`)).toBe(true);
});
