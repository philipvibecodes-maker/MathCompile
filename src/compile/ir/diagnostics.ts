import { head,isArray,isString,unquote } from './shapes';
import type { Issue,MathJson } from './types';

export function issue(severity: Issue['severity'], message: string): Issue {
  return { severity, message };
}

// CE reports parse problems as ['Error', "'<code>'", ['LatexString', "'<src>'"]]
// — translate the code to a plain-language message, quoting the offending
// fragment when CE carried one. `parse-failed` is our own catch-all for a
// thrown parse.
export function describeError(node: MathJson[]): string {
  const codeStr = isString(node[1]) ? node[1] : 'error';
  const code = unquote(codeStr) ?? codeStr;
  let src = '';
  for (const arg of node.slice(2)) {
    if (isArray(arg) && head(arg) === 'LatexString' && isString(arg[1])) {
      src = (unquote(arg[1]) ?? arg[1]).trim();
      break;
    }
  }
  const hint = src ? ` "${src}"` : '';
  switch (code) {
    case 'missing':
      return 'empty slot — fill it in or delete it';
    case 'unexpected-command':
      return describeCommand(src, hint);
    case 'unexpected-operator':
      return `stray operator${hint} — delete it or finish the expression`;
    case 'unexpected-delimiter':
      return `stray ${src || 'delimiter'} — unmatched delimiter`;
    case 'unbalanced-environment':
      return 'unclosed \\begin{...} — missing \\end{...}';
    case 'expected-closing-delimiter':
      return `missing closing brace${hint ? ` near${hint}` : ''}`;
    case 'parse-failed':
      return "couldn't parse this — check for a typo";
    default:
      return `unparseable input (${code})`;
  }
}

// A 'unexpected-command' diagnostic names the command CE couldn't
// place. \\ and \displaylines are serialization internals (the row
// separator and the multi-line wrapper), so inside an expression they
// mean a line break leaked into a group — describe that, not the token.
export function describeCommand(src: string, hint: string): string {
  if (src === '\\int')
    return 'integral sign with no integrand — type the integrand after ∫';
  if (src === '\\\\' || src === '\\newline')
    return 'unexpected line break inside an expression';
  if (src === '\\displaylines')
    return 'unexpected \\displaylines inside an expression';
  return `incomplete or unsupported command${hint}`;
}

