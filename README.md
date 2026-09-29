# MathCompile

Desmos-style multi-cell math expression editor built with **Svelte 5** +
TypeScript + Vite. Cells are MathLive `<math-field>` elements. See
`AGENTS.md` for architecture and `challenges.md` for the MathLive pitfalls
the design works around.

## Commands

- `npm run dev` — dev server on :5373
- `npm run build` — `svelte-check` + production build
- `npm run check` — typecheck via svelte-check
- `npm run lint` — oxlint
- `npm test` — vitest unit tests
- `npm run test:e2e` — Playwright e2e suite
