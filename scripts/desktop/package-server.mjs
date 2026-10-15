import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, chmod, cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { root, readJson, packageJson, run } from './common.mjs';
import { assertDesktopBuildNode } from './check-node.mjs';

export function runtimeTarget(platform, arch) {
  if (platform === 'darwin' && ['arm64', 'x64'].includes(arch)) return `darwin-${arch}`;
  if (platform === 'win32' && arch === 'x64') return 'win-x64';
  throw new Error(`Unsupported desktop platform: ${platform}/${arch}. Build on macOS (arm64/x64) or Windows x64.`);
}

export async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

// Next's standalone tracer can copy local .env files. Never distribute developer credentials.
export function distributable(path) {
  const name = basename(path);
  return name !== '.env' && !name.startsWith('.env.');
}

async function download(url, path) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${url}`);
  await pipeline(response.body, createWriteStream(`${path}.partial`));
  await cp(`${path}.partial`, path);
  await rm(`${path}.partial`);
}

export async function packageServer() {
  const pkg = await packageJson();
  const nodeVersion = pkg.desktop.nodeVersion;
  if (!/^22\.\d+\.\d+$/.test(nodeVersion)) throw new Error('desktop.nodeVersion must pin a full Node 22 version.');
  const target = runtimeTarget(process.platform, process.arch);
  const build = await readJson(join(root, '.next/desktop-build.json')).catch(() => {
    throw new Error('Missing build metadata. Run npm run build with Node 22 first.');
  });
  assertDesktopBuildNode(build.nodeVersion, nodeVersion, 'Standalone build Node.js');
  if (build.appVersion !== pkg.version) {
    throw new Error(`Standalone app version ${build.appVersion} does not match package version ${pkg.version}. Run npm run build again.`);
  }
  // Next can trace optional native modules (e.g. sharp). Do not ship another OS/architecture's build.
  if (build.platform !== process.platform || build.arch !== process.arch) {
    throw new Error('Standalone output must be built on the packaging OS and architecture. Run npm run build here.');
  }
  for (const path of ['.next/standalone/server.js', '.next/static', 'public', 'LICENSE', 'NOTICE', 'LICENSING.md', 'LICENSES']) {
    await access(join(root, path));
  }
  const cache = join(root, '.desktop-cache');
  await mkdir(cache, { recursive: true });
  const extension = process.platform === 'win32' ? 'zip' : 'tar.xz';
  const name = `node-v${nodeVersion}-${target}`;
  const archiveName = `${name}.${extension}`;
  const archive = join(cache, archiveName);
  const base = `https://nodejs.org/dist/v${nodeVersion}`;
  const checksumsResponse = await fetch(`${base}/SHASUMS256.txt`, { signal: AbortSignal.timeout(30_000) });
  if (!checksumsResponse.ok) throw new Error('Unable to fetch official Node SHA-256 checksums.');
  const checksums = await checksumsResponse.text();
  const expected = checksums.split(/\r?\n/).map((line) => line.trim().split(/\s+/))
    .find(([, file]) => file === archiveName)?.[0];
  if (!expected) throw new Error(`Missing official checksum for ${archiveName}`);
  const cachedHash = await sha256(archive).catch(() => null);
  if (cachedHash !== expected) {
    console.log(`Downloading ${archiveName}…`);
    await download(`${base}/${archiveName}`, archive);
  }
  if (await sha256(archive) !== expected) {
    await rm(archive);
    throw new Error('Node runtime checksum mismatch; discarded download.');
  }

  const destination = join(root, 'src-tauri/resources/server');
  // This path is fixed under the repo; only generated desktop resources are removed.
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const temp = await mkdtemp(join(cache, 'extract-'));
  try {
    if (process.platform === 'win32') {
      await run('tar', ['-xf', archive, '-C', temp]);
    } else {
      await run('tar', ['-xJf', archive, '-C', temp, `${name}/bin/node`, `${name}/LICENSE`]);
    }
    const extracted = join(temp, name);
    await cp(join(root, '.next/standalone'), destination, { recursive: true, dereference: true, filter: distributable });
    // Tauri's CSP only covers packaged assets, not HTTP navigations. Add the same
    // policy to Next's packaged routes manifest so the actual app receives it too.
    const routesPath = join(destination, '.next/routes-manifest.json');
    const routes = await readJson(routesPath);
    const config = await readJson(join(root, 'src-tauri/tauri.conf.json'));
    routes.headers.unshift({ source: '/:path*', regex: '^/.*$', headers: [{
      key: 'Content-Security-Policy', value: config.app.security.csp,
    }] });
    await writeFile(routesPath, JSON.stringify(routes));
    await cp(join(root, '.next/static'), join(destination, '.next/static'), { recursive: true });
    for (const path of ['public', 'LICENSE', 'NOTICE', 'LICENSING.md', 'LICENSES']) {
      await cp(join(root, path), join(destination, path), { recursive: true, filter: distributable });
    }
    const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
    await cp(join(extracted, process.platform === 'win32' ? nodeName : 'bin/node'), join(destination, nodeName));
    if (process.platform !== 'win32') await chmod(join(destination, nodeName), 0o755);
    else {
      for (const file of await readdir(extracted)) {
        if (file.toLowerCase().endsWith('.dll')) await cp(join(extracted, file), join(destination, file));
      }
    }
    await cp(join(extracted, 'LICENSE'), join(destination, 'LICENSES/Node.txt'));
    const hashes = {};
    async function hashTree(directory) {
      for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await hashTree(path);
        else hashes[relative(destination, path).split('\\').join('/')] = await sha256(path);
      }
    }
    await hashTree(destination);
    await writeFile(join(destination, 'server-manifest.json'), JSON.stringify({
      appVersion: pkg.version, nodeVersion, target, archiveSha256: expected, sha256: hashes,
    }, null, 2) + '\n');
    console.log(`Desktop server ready: ${destination} (${Object.keys(hashes).length} files)`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await packageServer();
}
