import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import ts from 'typescript';

const browserRequests = resolve('app/services') + sep;
for (const directory of ['app/api', 'app/lib']) {
  for (const name of readdirSync(directory, { recursive: true }) as string[]) {
    if (!/\.tsx?$/.test(name)) continue;
    const path = resolve(directory, name);
    const tree = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const statement of tree.statements) {
      if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      const target = specifier.text.startsWith('@/') ? resolve(specifier.text.slice(2)) : resolve(dirname(path), specifier.text);
      assert.ok(!target.startsWith(browserRequests), `${path} must import shared logic from app/lib, not browser requests: ${specifier.text}`);
    }
  }
}
