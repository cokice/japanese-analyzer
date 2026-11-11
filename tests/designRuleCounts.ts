import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Rule } from 'postcss';

export function countDesignViolations() {
  const counts = { arbitraryPx: 0, bareFontSize: 0, bareRadius: 0, weight700: 0, hexOutsideTokens: 0 };
  for (const directory of ['app', 'components']) {
    for (const name of readdirSync(directory, { recursive: true }) as string[]) {
      if (!/\.(?:tsx?|jsx?|css)$/.test(name)) continue;
      const path = join(directory, name);
      const source = readFileSync(path, 'utf8');
      if (path.endsWith('.css')) {
        postcss.parse(source).walkDecls(decl => {
          const selector = decl.parent?.type === 'rule' ? (decl.parent as Rule).selector : '';
          if (decl.prop.startsWith('--') && [':root', '.dark'].includes(selector)) return;
          counts.hexOutsideTokens += (decl.value.match(/#[\da-f]{3,8}\b/gi) || []).length;
          if (path === join('app', 'globals.css')) {
            const numeric = /\d/.test(decl.value.replace(/var\([^)]*\)/g, ''));
            if (decl.prop === 'font-size' && numeric) counts.bareFontSize++;
            if (decl.prop === 'border-radius' && numeric) counts.bareRadius++;
          }
          if (decl.prop === 'font-weight' && /\b700\b/.test(decl.value)) counts.weight700++;
        });
      } else {
        counts.arbitraryPx += (source.match(/\b[\w:-]+-\[[^\]\n]*\d+(?:\.\d+)?px[^\]\n]*\]/g) || []).length;
        counts.weight700 += (source.match(/\bfont-bold\b|font-\[700\]|fontWeight:\s*['"]?700/g) || []).length;
        counts.hexOutsideTokens += (source.match(/#[\da-f]{3,8}\b/gi) || []).length;
      }
    }
  }
  return counts;
}
