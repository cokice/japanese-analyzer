import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { distributable, runtimeTarget, sha256 } from '../scripts/desktop/package-server.mjs';
import { publishManifests } from '../scripts/desktop/publish-manifests.mjs';
import { assertDesktopBuildNode } from '../scripts/desktop/check-node.mjs';

test('desktop builds reject Node 24 with the actual version and actionable recovery steps', () => {
  assert.throws(() => assertDesktopBuildNode('24.11.1', '22.23.3'), (error) => {
    assert.match(error.message, /Current Node.js: v24\.11\.1/);
    assert.match(error.message, /require Node.js 22/);
    assert.match(error.message, /v22\.23\.3/);
    assert.match(error.message, /npm ci and npm run desktop:build/);
    return true;
  });
  assert.throws(() => assertDesktopBuildNode('24.11.1', '22.23.3', 'Standalone build Node.js'), /Standalone build Node.js: v24\.11\.1/);
  assert.doesNotThrow(() => assertDesktopBuildNode('22.23.3', '22.23.3'));
  assert.doesNotThrow(() => assertDesktopBuildNode('22.22.0', '22.23.3'));
});

test('only supported native desktop targets are packaged', () => {
  assert.equal(runtimeTarget('darwin', 'arm64'), 'darwin-arm64');
  assert.equal(runtimeTarget('darwin', 'x64'), 'darwin-x64');
  assert.equal(runtimeTarget('win32', 'x64'), 'win-x64');
  assert.throws(() => runtimeTarget('linux', 'x64'), /Unsupported/);
  assert.throws(() => runtimeTarget('win32', 'arm64'), /Unsupported/);
});

test('standalone copying strips environment secrets, including nested env files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'japanese-analyzer-package-'));
  try {
    const source = join(directory, 'source');
    const destination = join(directory, 'output');
    await mkdir(join(source, 'nested'), { recursive: true });
    for (const path of ['.env', '.env.local', '.env.production', 'nested/.env.secret', 'server.js']) {
      await writeFile(join(source, path), path === 'server.js' ? 'public server' : 'secret');
    }
    await cp(source, destination, { recursive: true, filter: distributable });
    assert.equal(await readFile(join(destination, 'server.js'), 'utf8'), 'public server');
    for (const path of ['.env', '.env.local', '.env.production', 'nested/.env.secret']) {
      await assert.rejects(readFile(join(destination, path)), { code: 'ENOENT' });
    }
    await writeFile(join(directory, 'hash'), 'abc');
    assert.equal(await sha256(join(directory, 'hash')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('release manifests contain both Mac architectures and the full Windows installer', async () => {
  const names = ['Japanese.Analyzer_aarch64.app.tar.gz', 'Japanese.Analyzer_x64.app.tar.gz', 'Japanese.Analyzer_1.2.3_x64-setup.exe'];
  const assets = names.flatMap((name, index) => [
    { id: index * 2, name, browser_download_url: `https://github.com/example/app/releases/download/untagged-abc/${name}` },
    { id: index * 2 + 1, name: `${name}.sig` },
  ]);
  const uploaded = [];
  const github = {
    paginate: async () => assets,
    rest: { repos: {
      getRelease: async () => ({ data: { tag_name: 'v1.2.3', body: 'Release notes', created_at: '2026-10-15T00:00:00Z' } }),
      listReleaseAssets: () => {},
      getReleaseAsset: async () => ({ data: Buffer.from('signed-bundle') }),
      uploadReleaseAsset: async (asset) => uploaded.push(asset),
    } },
  };
  await publishManifests(github, { owner: 'example', repo: 'app' }, 123);
  assert.deepEqual(uploaded.map((asset) => asset.name), ['latest-darwin.json', 'latest-windows.json']);
  const manifest = JSON.parse(uploaded[0].data);
  assert.equal(manifest.version, '1.2.3');
  assert.deepEqual(Object.keys(manifest.platforms).sort(), ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64']);
  assert.ok(manifest.platforms['windows-x86_64'].url.endsWith('setup.exe'));
  assert.ok(manifest.platforms['darwin-aarch64'].url.includes('/download/v1.2.3/'));
  assert.equal(manifest.platforms['darwin-x86_64'].signature, 'signed-bundle');
  assets.pop();
  await assert.rejects(publishManifests(github, { owner: 'example', repo: 'app' }, 123), /incomplete/);
});
