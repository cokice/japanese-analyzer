import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Color from 'colorjs.io';

// Sharma et al. reference pair also guards the metric/library selection.
assert.ok(Math.abs(Color.deltaE2000(new Color('lab', [50, 2.6772, -79.7751]), new Color('lab', [50, 0, -82.7485])) - 2.0425) < 0.0001);
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
for (const selector of [':root', '.dark']) {
  const blocks = [...css.matchAll(/(?:^|\n)(:root|\.dark)\s*\{([^}]+)\}/g)].filter(match => match[1] === selector);
  const colors = new Map(blocks.flatMap(match => [...match[2].matchAll(/--pos-([a-z]+):\s*(#[\da-f]{6});/gi)].map(color => [color[1], color[2]])));
  assert.equal(colors.size, 11, `${selector} must define all POS colors`);
  const entries = [...colors.entries()];
  let minimum = Infinity;
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const difference = Color.deltaE2000(entries[i][1], entries[j][1]);
    minimum = Math.min(minimum, difference);
    assert.ok(difference >= 15, `${selector}: ${entries[i][0]}/${entries[j][0]} ΔE00=${difference}`);
  }
  console.log(`${selector} POS minimum ΔE00: ${minimum.toFixed(2)}`);
}
