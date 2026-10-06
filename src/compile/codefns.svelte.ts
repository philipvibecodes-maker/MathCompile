// User-defined code functions: a name bound to a Python lambda body,
// created through the Define Python function dialog (command palette).
// Each def emits `name = lambda params: body` in every cell's prelude
// (extraPyLines — same machinery as `\py` statements), so `\name{args}`
// or `name(args)` calls resolve worksheet-wide.

export interface CodeFn {
  /** Identifier — also the `\name` command that calls it. */
  name: string;
  /** Lambda parameter names. */
  params: string[];
  /** Python expression the lambda returns. */
  body: string;
}

const STORAGE_KEY = 'mathcompile-codefns';

function load(): CodeFn[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CodeFn[]) : [];
  } catch {
    return [];
  }
}

export const codeFns = $state<CodeFn[]>(
  typeof localStorage === 'undefined' ? [] : load(),
);

// The Define Python function dialog's open flag — the palette command
// flips it; CodeFnDialog.svelte is always mounted and toggles
// visibility so open costs no remount.
export const codeFnDialog = $state({ open: false });

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(codeFns));
}

/** Define or redefine a code function (name is the key — redefine wins). */
export function defineCodeFn(fn: CodeFn): void {
  const i = codeFns.findIndex((f) => f.name === fn.name);
  if (i >= 0) codeFns[i] = fn;
  else codeFns.push(fn);
  persist();
}

export function removeCodeFn(name: string): void {
  const i = codeFns.findIndex((f) => f.name === name);
  if (i >= 0) {
    codeFns.splice(i, 1);
    persist();
  }
}

/** The prelude lines the defs emit — `name = lambda params: body`. */
export function codeFnPyLines(): string[] {
  return codeFns.map((f) =>
    f.params.length === 0
      ? `${f.name} = ${f.body}`
      : `${f.name} = lambda ${f.params.join(', ')}: ${f.body}`,
  );
}

/** Names a `\name{...}` call site may resolve to. */
export function codeFnNames(): Set<string> {
  return new Set(codeFns.map((f) => f.name));
}
