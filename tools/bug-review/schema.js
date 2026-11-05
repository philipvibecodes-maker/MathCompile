export const STATUSES = ['unreviewed', 'reproduced', 'not-reproduced', 'needs-decision', 'not-a-bug'];
export const DECISIONS = ['unspecified', 'describe', 'not-applicable'];
export const PRIORITIES = ['high', 'medium', 'low'];
export function removeFindings(data, ids) {
  if (!data?.findings || typeof data.findings !== 'object' || Array.isArray(data.findings)) return data;
  return {
    ...data,
    findings: Object.fromEntries(
      Object.entries(data.findings).filter(([id]) => !ids.has(id)),
    ),
  };
}
export function validateAnnotations(data, ids) {
  if (!data || data.version !== 1 || !data.findings || typeof data.findings !== 'object' || Array.isArray(data.findings))
    throw new Error('Expected a version 1 annotation document with a findings object.');
  for (const [id, record] of Object.entries(data.findings)) {
    if (!ids.has(id) || !record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Unknown or invalid finding: ${id}`);
    if (!STATUSES.includes(record.status) || !DECISIONS.includes(record.behavior)) throw new Error(`Invalid review state: ${id}`);
    if (record.priority !== undefined && !PRIORITIES.includes(record.priority)) throw new Error(`Invalid priority: ${id}`);
    if (record.setup !== undefined) {
      if (!record.setup || !Array.isArray(record.setup.cells) || !['calculator', 'latex', 'python'].includes(record.setup.target) || typeof record.setup.importAll !== 'boolean')
        throw new Error(`Invalid worksheet setup: ${id}`);
      for (const cell of record.setup.cells)
        if (!cell || !['math', 'python'].includes(cell.kind) || typeof cell.latex !== 'string')
          throw new Error(`Invalid input cell: ${id}`);
    }
    if (record.evidence !== undefined && (!record.evidence || ['at', 'revision', 'target'].some(key => typeof record.evidence[key] !== 'string')))
      throw new Error(`Invalid captured evidence: ${id}`);
    for (const key of ['observed', 'desired', 'notes'])
      if (typeof record[key] !== 'string') throw new Error(`Missing text field ${id}.${key}`);
  }
  return data;
}
