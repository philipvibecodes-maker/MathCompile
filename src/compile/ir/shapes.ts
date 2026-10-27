import type { MathJson } from './types';

export const isArray = (v: MathJson | undefined): v is MathJson[] => Array.isArray(v);
export const isString = (v: MathJson | undefined): v is string => typeof v === 'string';
export const head = (v: MathJson | undefined): string | undefined =>
  isArray(v) && isString(v[0]) ? v[0] : undefined;


// CE string literals arrive as "'text'" (e.g. \text{...}); `unquote`
// returns the inner text, or undefined for non-literals.
export const unquote = (s: string): string | undefined =>
  s.length >= 2 && s.startsWith("'") && s.endsWith("'")
    ? s.slice(1, -1)
    : undefined;
export const isTextLiteral = (v: MathJson): v is string =>
  isString(v) && unquote(v) !== undefined;

// CE marks unparseable atoms as the *quoted* symbol 'unexpected-command'
// (a string literal), e.g. `['Power', "'unexpected-command'", LatexString]
// for a bare `\int_{ }^{ }`.
export const isUnexpectedCommand = (v: MathJson): boolean =>
  v === "'unexpected-command'";


// Flatten a subscript position to symbol-name text: a_{n+1} -> 'a_{n+1}'.
// Best-effort — complex subscripts keep a readable placeholder name.
export function flattenSubscript(node: MathJson): string {
  if (isString(node)) return node;
  if (typeof node === 'number') return String(node);
  if (isArray(node)) {
    const h = head(node);
    if (h === 'Add') return node.slice(1).map(flattenSubscript).join('+');
    if (h === 'Multiply') return node.slice(1).map(flattenSubscript).join('');
    if (h === 'InvisibleOperator')
      return node.slice(1).map(flattenSubscript).join('');
    if (h === 'Negate') return `-${flattenSubscript(node[1])}`;
    if (h === 'Power')
      return `${flattenSubscript(node[1])}^${flattenSubscript(node[2])}`;
    // x_{i,j}/P_{5,2}: Sequence/Delimiter wrap the comma-list — join
    // with commas, dropping delimiter-marker text literals like '(,)'.
    if (h === 'Sequence' || h === 'Delimiter')
      return node
        .slice(1)
        .filter((c) => !isTextLiteral(c))
        .map(flattenSubscript)
        .join(',');
  }
  return '?';
}

// Is this node a plain symbol usable as an assignment target?
export const isSymbolString = (v: MathJson): v is string =>
  isString(v) && v !== '' && !v.startsWith("'");

// A parameter name slot — `x` or the quoted literal `'x'` CE puts in
// Typed declaration signatures (`f: x \mapsto x^2`). Strips the quotes
// without emitting a literal note; undefined for anything else.
export const paramName = (v: MathJson): string | undefined => {
  if (isSymbolString(v)) return v;
  return isString(v) ? unquote(v) : undefined;
};

// A Delimiter node's argument list: Delimiter(x) -> [x],
// Delimiter(Sequence(a, b), '(,)') -> [a, b] (the '(,)' marker is dropped).
export function delimiterArgs(delim: MathJson): MathJson[] {
  if (!isArray(delim)) return [delim];
  const inner = delim.slice(1).filter((a) => !isTextLiteral(a));
  if (inner.length === 1 && isArray(inner[0]) && head(inner[0]) === 'Sequence')
    return inner[0].slice(1);
  return inner;
}

// Is `last` a Delimiter/Delimiters group — the applicand of an
// InvisibleOperator application like f(x)?
export const isDelimiterGroup = (v: MathJson): v is MathJson[] =>
  isArray(v) && (head(v) === 'Delimiter' || head(v) === 'Delimiters');

// `(a, b, …)` — a paren-delimited comma list is a tuple: two elements
// are the open interval (or a 1×2 row matrix in pair-matrix mode),
// longer ones a 1×n row matrix. CE records the delimiters in the
// marker arg: '(,)' is parens; a bare `a,b` Sequence carries ',' and
// stays a List.
export const isParenTuple = (v: MathJson): v is MathJson[] =>
  isDelimiterGroup(v) &&
  isArray(v[1]) &&
  head(v[1]) === 'Sequence' &&
  isString(v[2]) &&
  unquote(v[2]) === '(,)';

// `[a,b]` in expression position is the same closed interval the
// `v = [a,b]` binding reads and the Interval CE mints on its own in
// set context (`x \in [a,b]`, `[a,b)`). Every raw 2-element List is a
// bracket pair — `\{…\}` parses as Set, paren pairs carry a Delimiter
// spec — so each becomes Interval; 3+-element Lists stay sequences.
// Two shapes keep their List nodes: Matrix rows are structural, and a
// destructuring bind (`[x,y] = [1,2]`) needs a real iterable list.
