// Includes type edges: even a currently erased cycle obscures ownership.
// TypeScript is already a project development dependency.
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/compile/', import.meta.url));
function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file)
      : file.endsWith('.ts') && !file.endsWith('.test.ts') ? [file] : [];
  });
}
const graph = new Map(sources(root).map((file) => [file, []]));
for (const [file, edges] of graph) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const node of source.statements) {
    if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ||
        !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const specifier = node.moduleSpecifier.text;
    if (!specifier.startsWith('.')) continue;
    const target = ts.resolveModuleName(specifier, file, {
      module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    }, ts.sys).resolvedModule?.resolvedFileName;
    if (!graph.has(target)) continue;
    for (const subsystem of ['codegen', 'ir']) {
      if (file.startsWith(path.join(root, subsystem) + path.sep) &&
          target === path.join(root, `${subsystem}.ts`))
        throw new Error(`Internal module imports its public facade: ${path.relative(root, file)}`);
    }
    edges.push(target);
  }
}
const visited = new Set();
const active = [];
function visit(file) {
  if (active.includes(file))
    throw new Error(`Compiler dependency cycle: ${[...active.slice(active.indexOf(file)), file]
      .map((item) => path.relative(root, item)).join(' -> ')}`);
  if (visited.has(file)) return;
  active.push(file);
  for (const target of graph.get(file)) visit(target);
  active.pop();
  visited.add(file);
}
for (const file of graph.keys()) visit(file);
console.log(`Compiler boundaries: ${graph.size} modules, no cycles (including type imports).`);
