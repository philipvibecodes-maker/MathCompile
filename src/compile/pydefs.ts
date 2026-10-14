// User-defined python functions: python cells (and \python{...} blocks
// inside math cells) contribute `def`/`lambda` bindings to a worksheet
// registry. A math-cell call `\mathrm{name}(x)` — or a `# @latex
// <notation>` alias on the def — compiles to a call of the real python
// function instead of minting a `sp.Function` stub.
//
// The registry keys on the *Compute Engine symbol name* the call site
// resolves to, not the raw latex: `\mathrm{relu}` parses to `relu` and
// `\mathcal{F}` to `F_calligraphic`, so annotations map whatever the
// user writes to the def's python name.
//
// Single-letter defs register only the `<name>_upright` key
// (`\mathrm{f}(x)`): the bare name `f` stays an ordinary italic
// variable, matching how `f(x)` reads as f·x without a \text{def}.

import { normalizeIR, parseCellLatex, type MathJson } from './ir';
import {
  CALL_RENAMES,
  MATRIX_WORD_OPS,
  SP_BUILTIN_CALL,
} from './notation';

export interface PyFnEntry {
  /** The python name the `def`/`lambda` binds — emitted verbatim (it is
   * already a valid python identifier). */
  ident: string;
  /** 0-based worksheet index of the cell whose source holds the def —
   * used by the call-below-definition note. */
  cell: number;
  /** Index into `PyRegistry.sources` — the snippet holding this def,
   * injected into a calling cell's standalone script (python target). */
  src: number;
}

export interface PyNote {
  /** 0-based worksheet index of the python cell the note belongs to. */
  cell: number;
  severity: 'note';
  message: string;
}

export interface PyRegistry {
  /** CE symbol name -> the python function it resolves to. */
  fns: Map<string, PyFnEntry>;
  /** Advisory notes on the python cells themselves (unreachable names,
   *  redefinitions, annotations that don't resolve to a name). */
  notes: PyNote[];
  /** The PythonSource snippets in worksheet order — codegen injects a
   *  used snippet's source into a calling cell's standalone script. */
  sources: { cell: number; code: string }[];
}

// Top-level-or-nested `def name(`, and `name = lambda` assignments —
// both bind a callable in the shared namespace.
const DEF_RE = /^[ \t]*(?:async[ \t]+)?def[ \t]+([A-Za-z_]\w*)[ \t]*\(/;
const LAMBDA_RE = /^[ \t]*([A-Za-z_]\w*)[ \t]*=[ \t]*lambda[ \t]/;
// Annotation comment: `# @latex <latex>` / `# latex: <latex>` — on the
// def line itself or on comment lines directly above it.
const LATEX_NOTE_RE = /#\s*@?latex\b\s*:?\s*(\S.*)$/;
const COMMENT_LINE_RE = /^\s*#/;

// `call`-tier names codegen routes to built-in behavior before the
// registry can see them — an annotation landing on one can never reach
// the user's def (same for KNOWN_HEADS, which normalizeIR keeps as real
// heads instead of `call` nodes).
const SHADOWED_CALL_NAMES = new Set([
  'Mean', // \bar{x} convention — emits sp.conjugate
  'Congruent',
  'Comprehension',
  'ForAll',
  'Exists',
  'GoldenRatio',
  'KroneckerDelta',
  'PseudoInverse',
  'Ring',
  'Superminus',
  'Superplus',
  'Superstar',
  'Trace',
]);

// Parse a `# @latex` annotation to the CE symbol name the same latex
// produces at a call site (`\mathcal{F}` -> `F_calligraphic`). Accepts
// call-shaped annotations like `\mathcal{F}(x)` — the callee name is
// what matters. Undefined when the latex isn't a name form.
function aliasName(latex: string): string | undefined {
  const n = normalizeIR(parseCellLatex(latex)).ir;
  if (typeof n === 'string') return n;
  if (Array.isArray(n) && n[0] === 'call' && typeof n[1] === 'string')
    return n[1];
  return undefined;
}

// Does `<latex>(x)` actually reach codegen's registry lookup? Known
// heads (Sin, Sum, …) never become `call` nodes; call-tier names the
// codegen claims (sp.<name> builtins, matrix word-ops, the special-cased
// names in SHADOWED_CALL_NAMES) never reach the user-function branch.
function reachable(latex: string, ceName: string): boolean {
  const probe = normalizeIR(parseCellLatex(`${latex}(x)`)).ir;
  return (
    Array.isArray(probe) &&
    probe[0] === 'call' &&
    probe[1] === ceName &&
    !SHADOWED_CALL_NAMES.has(ceName) &&
    !SP_BUILTIN_CALL.has(ceName) &&
    CALL_RENAMES[ceName] === undefined &&
    !MATRIX_WORD_OPS.has(ceName)
  );
}

interface ScannedDef {
  name: string;
  /** `{ latex, ceName }` pairs the def is callable under — the default
   *  `\mathrm{name}` form plus every `# @latex` alias that resolved. */
  aliases: { latex: string; ceName: string }[];
}

// One PythonSource snippet's defs with their resolved aliases.
function scanSource(
  code: string,
  notes: { severity: 'note'; message: string }[],
): ScannedDef[] {
  const defs: ScannedDef[] = [];
  // Annotation comments pending for the next def — contiguous comment
  // and blank lines above the def carry them.
  let pending: { latex: string }[] = [];
  const resolveAlias = (latex: string): { latex: string; ceName: string }[] => {
    const ceName = aliasName(latex);
    if (ceName === undefined) {
      notes.push({
        severity: 'note',
        message: `# @latex "${latex}" doesn't resolve to a callable name — use a single notation like \\mathcal{F}`,
      });
      return [];
    }
    return [{ latex, ceName }];
  };
  for (const line of code.split('\n')) {
    const dm = DEF_RE.exec(line) ?? LAMBDA_RE.exec(line);
    if (dm) {
      const aliases = pending.flatMap((a) => resolveAlias(a.latex));
      pending = [];
      const trailing = LATEX_NOTE_RE.exec(line);
      if (trailing) aliases.push(...resolveAlias(trailing[1].trim()));
      defs.push({ name: dm[1], aliases });
      continue;
    }
    if (line.trim() === '') continue; // blank lines keep pending
    if (COMMENT_LINE_RE.test(line)) {
      const am = LATEX_NOTE_RE.exec(line);
      if (am) pending.push({ latex: am[1].trim() });
      continue;
    }
    pending = [];
  }
  return defs;
}

// The latex spelling that produces a def's default key: multi-letter
// names arrive as themselves (`\mathrm{relu}` -> `relu`); a single
// letter gets CE's upright tag (`\mathrm{f}` -> `f_upright`) so the
// bare italic `f` keeps reading as a variable.
const defaultAlias = (name: string): { latex: string; ceName: string } =>
  name.length === 1
    ? { latex: `\\mathrm{${name}}`, ceName: `${name}_upright` }
    : { latex: `\\mathrm{${name}}`, ceName: name };

const isArr = (v: MathJson | undefined): v is MathJson[] => Array.isArray(v);

// Scan one cell's normalized IR for PythonSource snippets (a python
// cell's json IS one; a math cell's \python{...} blocks nest inside a
// Block), returning each snippet's source.
function pythonSnippets(json: MathJson | undefined): string[] {
  const out: string[] = [];
  const walk = (n: MathJson | undefined) => {
    if (!isArr(n)) return;
    if (n[0] === 'PythonSource' && typeof n[1] === 'string') out.push(n[1]);
    for (const c of n.slice(1)) walk(c);
  };
  walk(json);
  return out;
}

// Build the worksheet's python-function registry. `cells` are the
// CellInputs being compiled — calc callers pass the full worksheet even
// when only a prefix compiles, so a call can resolve (and note) a def
// sitting below it.
export function collectPyFns(cells: readonly { json?: MathJson }[]): PyRegistry {
  const fns = new Map<string, PyFnEntry>();
  const notes: PyNote[] = [];
  const sources: { cell: number; code: string }[] = [];
  cells.forEach((cell, cellIdx) => {
    for (const code of pythonSnippets(cell.json)) {
      const src = sources.length;
      sources.push({ cell: cellIdx, code });
      const cellNotes: { severity: 'note'; message: string }[] = [];
      for (const def of scanSource(code, cellNotes)) {
        const aliases = [defaultAlias(def.name), ...def.aliases];
        for (const { latex, ceName } of aliases) {
          const prev = fns.get(ceName);
          fns.set(ceName, { ident: def.name, cell: cellIdx, src });
          if (prev !== undefined && prev.ident !== def.name)
            cellNotes.push({
              severity: 'note',
              message: `${latex} is annotated for both ${prev.ident} and ${def.name} — the later def wins`,
            });
          if (!reachable(latex, ceName))
            cellNotes.push({
              severity: 'note',
              message: `${latex}(…) resolves to a SymPy built-in, not ${def.name} — give it a different # @latex name`,
            });
        }
      }
      notes.push(...cellNotes.map((n) => ({ ...n, cell: cellIdx })));
    }
  });
  return { fns, notes, sources };
}
