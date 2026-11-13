import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countDesignViolations } from './designRuleCounts';

const limits = JSON.parse(readFileSync(new URL('./design-baseline.json', import.meta.url), 'utf8')) as ReturnType<typeof countDesignViolations>;
const counts = countDesignViolations();
for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
  assert.ok(counts[key] <= limits[key], `${key}: ${counts[key]} exceeds design baseline ${limits[key]}; use tokens or lower existing violations`);
}
console.log('Design-rule ceilings passed:', counts);
