// Run after all platform jobs to avoid concurrent writes losing an architecture.
export async function publishManifests(github, repo, releaseId) {
  const { data: release } = await github.rest.repos.getRelease({ ...repo, release_id: releaseId });
  const assets = await github.paginate(github.rest.repos.listReleaseAssets, { ...repo, release_id: releaseId, per_page: 100 });
  const platforms = {};
  for (const [platform, match] of [
    ['darwin-aarch64', /_aarch64\.app\.tar\.gz$/],
    ['darwin-x86_64', /_x64\.app\.tar\.gz$/],
    ['windows-x86_64', /_x64-setup\.exe$/],
  ]) {
    const bundle = assets.find((asset) => match.test(asset.name));
    if (!bundle) continue;
    const signature = assets.find((asset) => asset.name === `${bundle.name}.sig`);
    if (!signature) continue; // Unsigned builds can still be installed manually.
    const { data } = await github.rest.repos.getReleaseAsset({ ...repo, asset_id: signature.id, headers: { accept: 'application/octet-stream' } });
    const url = bundle.browser_download_url.replace(/\/download\/untagged-[^/]+\//, `/download/${encodeURIComponent(release.tag_name)}/`);
    const signed = Buffer.from(data).toString('utf8').trim();
    if (!signed) throw new Error(`Empty updater signature: ${signature.name}`);
    platforms[platform] = { url, signature: signed };
  }
  if (!Object.keys(platforms).length) {
    console.log('No signed updater bundles; skipping updater manifests.');
    return;
  }
  if (Object.keys(platforms).length !== 3) throw new Error('Signed release is incomplete: expected both macOS architectures and Windows x64.');
  // These files contain both Mac architectures and only complete signed entries.
  const version = release.tag_name.startsWith('v') ? release.tag_name.slice(1)
    : assets.map((asset) => asset.name.match(/_(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)_(?:aarch64|x64)/)?.[1]).find(Boolean);
  if (!version) throw new Error('Cannot determine updater version.');
  const body = JSON.stringify({ version, notes: release.body || '', pub_date: release.published_at || release.created_at, platforms }, null, 2);
  for (const name of ['latest-darwin.json', 'latest-windows.json']) {
    const previous = assets.find((asset) => asset.name === name);
    if (previous) await github.rest.repos.deleteReleaseAsset({ ...repo, asset_id: previous.id });
    await github.rest.repos.uploadReleaseAsset({ ...repo, release_id: releaseId, name, data: Buffer.from(body), headers: { 'content-type': 'application/json' } });
  }
}
