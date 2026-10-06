// User-defined notation: a macro `\name{arg}…` that renders in the field
// as `name(arg)` (vendored UserMacro command) and expands to its body
// latex at compile time. Two origins share one lookup table:
//
// - user macros: defined through UI (dialog, panel, JIT suggestion),
//   persisted to localStorage and survive reload.
// - cell macros: defined by `\text{notation}`/`\newcommand` statements
//   inside cells; resynced from the worksheet on every cell mutation so
//   deleting a definition unregisters it.

export interface MacroDef {
  /** The command name without the backslash (`vv` for `\vv`). */
  name: string;
  /** Brace groups the usage consumes — `\vv{u}` has arity 1. */
  arity: number;
  /** Placeholder names the body references positionally (`x`), in
   *  argument order. `\newcommand` defs leave this empty — their bodies
   *  use `#1`..`#n` like LaTeX. */
  params: string[];
  /** Expansion latex. */
  body: string;
}

const STORAGE_KEY = 'mathcompile-notation';

const userMacros = $state<MacroDef[]>([]);
const cellMacros = $state<MacroDef[]>([]);
let restored = false;

const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

function restore() {
  if (restored) return;
  restored = true;
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const m of parsed) {
      const d = m as Partial<MacroDef>;
      if (
        typeof d.name !== 'string' ||
        !/^[A-Za-z]+$/.test(d.name) ||
        typeof d.body !== 'string'
      )
        continue;
      pushUserMacro({
        name: d.name,
        arity: typeof d.arity === 'number' ? d.arity : 0,
        params: Array.isArray(d.params) ? d.params.filter(isString) : [],
        body: d.body,
      });
    }
  } catch {
    // Corrupt storage — start empty.
  }
}

const isString = (v: unknown): v is string => typeof v === 'string';

// Register/unregister the \name command in the vendored MathQuill
// build. The hook returns false when the name is a real command —
// builtins always win over user notation. Node (vitest) has no window:
// registration is a no-op and always "succeeds".
const mqWindow = () =>
  (typeof window === 'undefined' ? undefined : window) as
    | {
        __mcUserMacro?: (name: string, arity: number) => boolean;
        __mcUserMacroRemove?: (name: string) => void;
      }
    | undefined;

function pushUserMacro(def: MacroDef): boolean {
  const hook = mqWindow()?.__mcUserMacro;
  if (hook && !hook(def.name, def.arity)) return false;
  const i = userMacros.findIndex((m) => m.name === def.name);
  if (i >= 0) userMacros[i] = def;
  else userMacros.push(def);
  return true;
}

function saveUserMacros() {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(userMacros));
  } catch {
    // Storage full or disabled — macros live in memory only.
  }
}

export function defineUserMacro(def: MacroDef): boolean {
  restore();
  if (!/^[A-Za-z]+$/.test(def.name)) return false;
  if (!pushUserMacro(def)) return false;
  saveUserMacros();
  return true;
}

export function removeUserMacro(name: string) {
  const i = userMacros.findIndex((m) => m.name === name);
  if (i < 0) return;
  userMacros.splice(i, 1);
  saveUserMacros();
  mqWindow()?.__mcUserMacroRemove?.(name);
}

const sameDef = (a: MacroDef, b: MacroDef) =>
  a.name === b.name &&
  a.arity === b.arity &&
  a.body === b.body &&
  a.params.join('') === b.params.join('');

/** Replace the cell-sourced portion of the table — called by the store
 *  on every worksheet mutation so a deleted definition stops working.
 *  Returns true when the table changed (callers reparse their cells —
 *  cached IR holds stale expansions otherwise). */
export function setCellMacros(defs: MacroDef[]): boolean {
  restore();
  const removed = cellMacros.filter(
    (m) => !defs.some((d) => d.name === m.name),
  );
  const changed =
    defs.length !== cellMacros.length ||
    defs.some((d, i) => !sameDef(d, cellMacros[i]));
  cellMacros.splice(0, cellMacros.length, ...defs);
  for (const def of defs) {
    const hook = mqWindow()?.__mcUserMacro;
    if (hook && !hook(def.name, def.arity))
      // Name collides with a builtin — drop it so it can't shadow or
      // corrupt real commands in the expansion table.
      cellMacros.splice(
        cellMacros.findIndex((d) => d.name === def.name),
        1,
      );
  }
  for (const m of removed)
    if (!defs.some((d) => d.name === m.name))
      mqWindow()?.__mcUserMacroRemove?.(m.name);
  return changed;
}

/** All live macros — cell defs first so an in-cell `\newcommand`
 *  overrides a same-named UI macro (\renewcommand semantics). */
export function listMacros(): MacroDef[] {
  restore();
  return [...cellMacros, ...userMacros];
}

export function getMacro(name: string): MacroDef | undefined {
  restore();
  return (
    cellMacros.find((m) => m.name === name) ??
    userMacros.find((m) => m.name === name)
  );
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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function substitute(def: MacroDef, args: string[]): string {
  let body = def.body;
  def.params.forEach((p, k) => {
    const arg = args[k];
    if (arg === undefined) return;
    body = p.startsWith('\\')
      ? body.split(p).join(arg)
      : body.replace(
          // Whole-token replacement: `x` in `\xi` is skipped (preceded
          // by a backslash) and `x` in `xy` is skipped (followed by a
          // letter).
          new RegExp(`(?<![\\\\A-Za-z])${escapeRe(p)}(?![A-Za-z])`, 'g'),
          arg,
        );
  });
  for (let k = 0; k < args.length; k++)
    body = body.split(`#${k + 1}`).join(args[k]);
  return body;
}

// Expand every `\name{arg}…` macro call in a latex string. Unknown
// commands and calls missing a brace group pass through untouched.
// Re-runs until fixpoint so nested uses (`\sq{3 + \half}`, a body that
// invokes another macro) fully expand; capped so a self-referential
// body can't loop forever — whatever remains unexpanded at the cap
// flags as an unsupported command downstream.
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
  restore();
  if (cellMacros.length === 0 && userMacros.length === 0) return latex;
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
    const def =
      cellMacros.find((d) => d.name === m[1]) ??
      userMacros.find((d) => d.name === m[1]);
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

// ---- statement forms ------------------------------------------------

// A `\text{notation} <lhs> := <body>` statement (the `\notation` command
// types the marker) or a pasted `\newcommand{\n}[a]{body}` leaf. Returns
// null for ordinary statements.
export function parseNotationDef(s: string): MacroDef | null {
  let m = s.match(
    /^\\(?:newcommand|renewcommand|providecommand)\s*\\?\s*\{\\([A-Za-z]+)\}\s*(?:\[(\d+)\])?\s*\{/,
  );
  if (m) {
    const open = s.indexOf('{', m[0].length - 1);
    const g = readGroup(s, open);
    if (!g || s.slice(g.end).trim() !== '') return null;
    const arity = m[2] ? Number(m[2]) : (g.content.match(/#\d/g)?.length ?? 0);
    return { name: m[1], arity, params: [], body: g.content };
  }

  m = s.match(/^\\text\{\s*notation\s*\}\s*(?:\\ )?\s*(.*)$/);
  if (!m) return null;
  const rest = m[1];
  const eq = rest.search(/:=|=(?![<>=])/);
  if (eq < 0) return null;
  const lhs = rest.slice(0, eq).trim();
  const body = rest
    .slice(eq + (rest.startsWith(':=', eq) ? 2 : 1))
    .trim();
  if (!lhs || !body) return null;

  // LHS: `\name`, `\name{a}{b}`, `\name(a,b)` (auto-paired `\left(…
  // \right)` too), the styled spellings `\mathrm{name}(…)`/`\text{name}`,
  // or a bare letter run `vv(…)` — what plain typing produces.
  const lm =
    lhs.match(
      /^\\(?:mathrm|mathbf|mathit|mathsf|mathtt|operatorname|mathcal|text)\{([A-Za-z]+)\}(.*)$/,
    ) ??
    lhs.match(/^\\([A-Za-z]+)(.*)$/) ??
    lhs.match(/^([A-Za-z]+)(.*)$/);
  if (!lm) return null;
  const name = lm[1];
  let argSrc = lm[2].trim();
  const params: string[] = [];
  if (argSrc !== '') {
    argSrc = argSrc.replace(/^\\left/, '').replace(/\\right/, '');
    if (argSrc.startsWith('(')) {
      const close = argSrc.lastIndexOf(')');
      if (close < 0) return null;
      params.push(
        ...argSrc
          .slice(1, close)
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t !== ''),
      );
    } else {
      // `\vv{x}{y}` — params are consecutive brace groups.
      let j = 0;
      while (argSrc[j] === '{') {
        const g = readGroup(argSrc, j);
        if (!g) return null;
        params.push(g.content.trim());
        j = g.end;
        while (argSrc[j] === ' ') j++;
      }
      if (argSrc.slice(j).trim() !== '') return null;
    }
  }
  return { name, arity: params.length, params, body };
}
