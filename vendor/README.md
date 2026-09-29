# vendor/mathquill

Vendored copy of https://github.com/desmosinc/mathquill (the Desmos fork —
TypeScript source, jQuery-free v3 API, MPL-2.0), pinned at commit:

    bb9974ab637e1dd57673fe8c96a00c85cfc3da37 (main, 2026-08-07)

plus local patches under `src/commands/math/environments.ts` (matrix +
`\displaylines` environments) and other `MATHCOMPILE` marked additions.

## Rebuild

```
cd vendor/mathquill
npm ci        # first time only (typescript + less + devDeps)
make dev      # or: make js css font
```

Outputs land in `build/`: `mathquill.js` (concatenated, transpiled ES5),
`mathquill.css`, `fonts/`. The app imports them via
`src/editor/mathquill.ts`.

## Why vendored

No published MathQuill build supports `\begin{matrix}`-style environments
on the modern (post-2017, jQuery-free) codebase — matrix support exists
only on the abandoned jQuery-era forks (Learnosity `matrix` branch,
upstream PR mathquill#762). Vendoring lets us port that implementation
onto the Desmos base and add app-specific commands (`\derivative`,
`int`/`sum` bound templates) in-tree.
