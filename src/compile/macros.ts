// User-defined notation: a `\newcommand{\name}[n]{body}` statement in a
// cell registers a macro `\name{arg}…` that renders in the field as
// `name(arg)` (the vendored UserMacro command) and expands to its body
// latex at compile time. The macro table is resynced from the whole
// worksheet on every mutation, so deleting a definition unregisters it
// and a `\name` that stops working flags honestly downstream.

export interface MacroDef {
  /** The command name without the backslash (`vv` for `\vv`). */
  name: string;
  /** Brace groups a use consumes — `\vv{u}` has arity 1. */
  arity: number;
  /** Expansion latex; `#1`..`#n` mark the positional arguments, like
   *  real `\newcommand` bodies. */
  body: string;
}

const cellMacros: MacroDef[] = [];
// Names whose def was rejected by registration (builtin collision — a
// `\newcommand` may not take over a real command's name). Recomputed
// per sync; parseCellLatex turns a rejected def into an error flag.
const rejected = new Set<string>();

// Register/unregister the \name command in the vendored MathQuill
// build. The hook returns false when the name is a real command —
// builtins always win over user notation. Node (vitest) has no window:
// registration is a no-op and every def "succeeds".
const mqWindow = () =>
  (typeof window === 'undefined' ? undefined : window) as
    | {
        __mcUserMacro?: (name: string, arity: number) => boolean;
        __mcUserMacroRemove?: (name: string) => void;
      }
    | undefined;

export function getMacro(name: string): MacroDef | undefined {
  return cellMacros.find((m) => m.name === name);
}

export function listMacros(): MacroDef[] {
  return cellMacros;
}

/** Whether the live table rejected a def of `name` at the last sync. */
export function macroRejected(name: string): boolean {
  return rejected.has(name);
}

const sameDef = (a: MacroDef, b: MacroDef) =>
  a.name === b.name && a.arity === b.arity && a.body === b.body;

/** Replace the macro table — called by the store on every worksheet
 *  mutation so a deleted definition stops expanding and unregisters
 *  its `\name` command. Returns true when the table changed, meaning
 *  every cached parse is stale (callers reparse all cells). */
export function setCellMacros(defs: MacroDef[]): boolean {
  const removed = cellMacros.filter(
    (m) => !defs.some((d) => d.name === m.name),
  );
  const changed =
    defs.length !== cellMacros.length ||
    defs.some((d, i) => !sameDef(d, cellMacros[i]));
  cellMacros.splice(0, cellMacros.length, ...defs);
  rejected.clear();
  const hook = mqWindow()?.__mcUserMacro;
  for (const def of defs) {
    if (hook && !hook(def.name, def.arity)) {
      // Builtin collision — drop the def so it can't shadow or corrupt
      // real commands in the expansion table, and remember it so the
      // def statement flags an error instead of a silent no-op.
      cellMacros.splice(
        cellMacros.findIndex((d) => d.name === def.name),
        1,
      );
      rejected.add(def.name);
    }
  }
  const rm = mqWindow()?.__mcUserMacroRemove;
  for (const m of removed)
    if (!defs.some((d) => d.name === m.name)) rm?.(m.name);
  return changed;
}

// ---- expansion ------------------------------------------------------

// `{…}` group at position i (latex[i] === '{'); returns inner text and
// the index just past `}`. Unbalanced input yields null.
function readGroup(
  latex: string,
  i: number,
): { content: string; end: number } | null {
  let depth = 0;
  for (let j = i; j < latex.length; j++) {
    const ch = latex[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { content: latex.slice(i + 1, j), end: j + 1 };
    }
  }
  return null;
}

function substitute(def: MacroDef, args: string[]): string {
  let body = def.body;
  for (let k = 0; k < args.length; k++)
    body = body.split(`#${k + 1}`).join(args[k]);
  return body;
}

// Expand every `\name{arg}…` macro call in a latex string, re-running
// until fixpoint so nested uses (`\sq{3 + \half}`, a body that invokes
// another macro) fully expand. Capped so a self-referential body can't
// loop forever — whatever remains unexpanded at the cap flags as an
// unsupported command downstream.
export function expandLatex(latex: string): string {
  let cur = latex;
  for (let round = 0; round < 8; round++) {
    const next = expandOnce(cur);
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}

function expandOnce(latex: string): string {
  if (cellMacros.length === 0) return latex;
  let out = '';
  let last = 0;
  let i = 0;
  while (i < latex.length) {
    const bs = latex.indexOf('\\', i);
    if (bs < 0) break;
    const m = /^\\([A-Za-z]+)/.exec(latex.slice(bs));
    if (!m) {
      i = bs + 1;
      continue;
    }
    const def = cellMacros.find((d) => d.name === m[1]);
    if (!def) {
      i = bs + m[0].length;
      continue;
    }
    let j = bs + m[0].length;
    const args: string[] = [];
    let ok = true;
    for (let k = 0; k < def.arity; k++) {
      while (latex[j] === ' ') j++;
      if (latex[j] !== '{') {
        ok = false;
        break;
      }
      const g = readGroup(latex, j);
      if (!g) {
        ok = false;
        break;
      }
      args.push(expandLatex(g.content));
      j = g.end;
    }
    if (!ok) {
      i = bs + m[0].length;
      continue;
    }
    out += latex.slice(last, bs) + substitute(def, args);
    last = j;
    i = j;
  }
  return out + latex.slice(last);
}

// ---- \newcommand statements ------------------------------------------

const DEF_HEAD = /^\s*\\(newcommand|renewcommand|providecommand)(?![A-Za-z])/;

// `\left\{…\right\}` at position i — the serialization a typed `{…}`
// group produces. \left/\right depth is tracked so a nested pair inside
// doesn't end the group early; the letter check keeps `\leftrightarrow`
// /`\rightarrow` from counting as delimiters. Returns inner text plus
// the index just past `\right\}`.
function readBracePair(
  s: string,
  i: number,
): { content: string; end: number } | null {
  if (!s.startsWith('\\left\\{', i)) return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] !== '\\') continue;
    if (
      s.startsWith('\\left', j) &&
      !/[A-Za-z]/.test(s[j + 5] ?? '')
    ) {
      depth++;
    } else if (
      s.startsWith('\\right', j) &&
      !/[A-Za-z]/.test(s[j + 6] ?? '')
    ) {
      depth--;
      if (depth === 0) {
        const d = j + 6;
        if (s.startsWith('\\}', d))
          return { content: s.slice(i + 7, j), end: d + 2 };
        if (s[d] === '}') return { content: s.slice(i + 7, j), end: d + 1 };
        return null;
      }
    }
  }
  return null;
}

// A `{…}` or `\left\{…\right\}` group at position i (after spaces).
function readAnyGroup(
  s: string,
  i: number,
): { content: string; end: number } | null {
  while (s[i] === ' ') i++;
  if (s[i] === '{') return readGroup(s, i);
  return readBracePair(s, i);
}

// The name inside a `\newcommand` name spec: `\vv`, `\text{vv}`,
// `\mathrm{vv}`, or a bare letter run `vv` — the spellings typed input
// and pasted latex both produce. Trailing `{ }` blocks are tolerated:
// an already-registered macro serializes inside the spec as `\vv{ }`.
function extractName(spec: string): string | null {
  const inner = spec.trim();
  const m =
    /^\\(?:text|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|operatorname)\{([A-Za-z]+)\}/.exec(
      inner,
    ) ??
    /^\\([A-Za-z]+)/.exec(inner) ??
    /^([A-Za-z]+)/.exec(inner);
  if (!m) return null;
  const rest = inner.slice(m[0].length).trim();
  // Leftover must be nothing or empty `{ }` arg blocks (a registered
  // macro's rendered arg slots).
  return /^(\{\s*\}\s*)*$/.test(rest) ? m[1] : null;
}

// A `\newcommand{\name}[n]{body}` (or renew/provide) statement — the
// in-cell way to define user notation. Both serializations parse: the
// verbatim pasted form (`\newcommand{\vv}[1]{…}`, kept whole by the
// vendored RawArgCommand leaf) and the field form typed input produces
// (`\newcommand\left\{\text{vv}\right\}\left[1\right]\left\{…\right\}`).
// Returns null for ordinary statements.
export function parseNotationDef(s: string): MacroDef | null {
  const head = DEF_HEAD.exec(s);
  if (!head) return null;
  let i = head.index + head[0].length;
  while (s[i] === ' ') i++;

  // Name spec: a brace group in either serialization, or a bare name.
  let name: string | null = null;
  const spec = readAnyGroup(s, i);
  if (spec) {
    name = extractName(spec.content);
    i = spec.end;
  } else {
    const bare = /^(\\(?:text|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|operatorname)\{[A-Za-z]+\}|\\[A-Za-z]+|[A-Za-z]+)/.exec(
      s.slice(i),
    );
    if (!bare) return null;
    name = extractName(bare[1]);
    i += bare[0].length;
  }
  if (!name) return null;
  while (s[i] === ' ') i++;

  // Optional [n] arity — `[n]` pasted or `\left[n\right]` typed.
  let arity: number | undefined;
  if (s[i] === '[') {
    const close = s.indexOf(']', i);
    if (close < 0) return null;
    const digits = s.slice(i + 1, close).trim();
    if (!/^\d+$/.test(digits)) return null;
    arity = Number(digits);
    i = close + 1;
  } else if (s.startsWith('\\left[', i)) {
    const close = s.indexOf('\\right]', i);
    if (close < 0) return null;
    const digits = s.slice(i + 6, close).trim();
    if (!/^\d+$/.test(digits)) return null;
    arity = Number(digits);
    i = close + 7;
  }
  while (s[i] === ' ') i++;

  const body = readAnyGroup(s, i);
  if (!body || s.slice(body.end).trim() !== '') return null;

  // No [n] — LaTeX requires one, but inferring the arity from the
  // highest #k placeholder keeps an omitted count from dead-ending
  // an otherwise valid def.
  if (arity === undefined) {
    let max = 0;
    for (const m of body.content.matchAll(/#([1-9])/g))
      max = Math.max(max, Number(m[1]));
    arity = max;
  }
  return { name, arity, body: body.content };
}
