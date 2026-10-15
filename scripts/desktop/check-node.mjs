import { pathToFileURL } from 'node:url';
import { packageJson } from './common.mjs';

export function assertDesktopBuildNode(actual, pinned, source = 'Current Node.js') {
  if (!/^22\.\d+\.\d+(?:[-+].+)?$/.test(actual)) {
    throw new Error(
      `${source}: v${actual}. Desktop builds require Node.js 22 (bundled runtime: v${pinned}).\n` +
      `请切换到 Node.js 22（建议 ${pinned}），重新打开终端，运行 node -v 确认，再执行 npm ci 和 npm run desktop:build。\n` +
      'Switch to Node.js 22, reopen your terminal, verify node -v, then run npm ci and npm run desktop:build.'
    );
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const pkg = await packageJson();
    assertDesktopBuildNode(process.versions.node, pkg.desktop.nodeVersion);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
