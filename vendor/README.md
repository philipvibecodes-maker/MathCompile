# Vendored dependencies

## mathquill/

Vendored copy of the Desmos fork of MathQuill
(`https://github.com/desmosinc/mathquill`).

- Pinned commit: `bb9974ab637e1dd57673fe8c96a00c85cfc3da37`
  (2026-08-07, "Merge pull request #358 from
  desmosinc/feature-detect-spacing-bug")
- License: MPL-2.0 (see `mathquill/README.md` / upstream headers)

### Local patches on top of upstream

(none yet — Phase 1 adds `src/commands/math/environments.ts` for
`\begin{matrix}`/`\displaylines` plus custom `LatexCmds` entries)

### Rebuilding

```
cd vendor/mathquill
npm install   # devDeps only: less, typescript, uglify-js, mocha
make dev      # = font + css + js (unminified build/mathquill.js)
```

Outputs land in `vendor/mathquill/build/` (`mathquill.js`, `mathquill.css`,
`fonts/`) and are committed so the app works without a rebuild.
