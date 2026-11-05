import { readFile } from 'node:fs/promises';

export const SOURCE = {
  branch: 'codex/extended-bug-hunt',
  commit: '8e12e56b595992996e1dc7943c5bab0e709971b2',
  investigationBaseline: 'eb8cdc2318f219d2f6d97cfe1dcc67c5d2ba268f',
  reviewBaseline: '8e69e4d92e18b534d51a98f369c66a6778ea6637',
};
export const REPORTS = { UI: 'ui', CG: 'codegen', RENDER: 'rendering', PLOT: 'plotting' };
// Fixed by PR #114. Keep the historical report Markdown unchanged, but do not
// offer resolved findings in the active reproduction queue.
export const FIXED_FINDINGS = new Set(['CG-02', 'CG-16', 'CG-21']);

export async function readCatalog(root) {
  const findings = [];
  for (const [area, name] of Object.entries(REPORTS)) {
    const path = `reports/bug-hunt/${name}.md`;
    const source = await readFile(new URL(path, root), 'utf8');
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#{2,3}) ((?:UI|CG|RENDER|PLOT)-\d{2}) — (.+)$/);
      if (!match) continue;
      if (FIXED_FINDINGS.has(match[2])) continue;
      let end = i + 1;
      while (end < lines.length && !new RegExp(`^#{1,${match[1].length}} `).test(lines[end])) end++;
      const markdown = lines.slice(i, end).join('\n');
      const severity = markdown.match(/severity[:\s*]*(high|medium|low)/i)?.[1]
        ?? match[3].match(/\b(high|medium|low)\b/i)?.[1] ?? 'unspecified';
      findings.push({ id: match[2], title: match[3], area, severity: severity.toLowerCase(), path, line: i + 1, markdown });
    }
  }
  if (findings.length !== 124 || new Set(findings.map(f => f.id)).size !== 124)
    throw new Error(`Expected 124 unique unresolved findings, found ${findings.length}`);
  return findings;
}

export { validateAnnotations } from './schema.js';
