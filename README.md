# MathCompile

Desmos-style multi-cell math expression editor. **SolidJS** + TypeScript +
Vite; cells are MathLive `<math-field>` elements. See `challenges.md` for
the design rationale behind the Solid rewrite and `AGENTS.md` for
architecture notes.

## Commands

- `npm run dev` — dev server on :5273
- `npm run build` — typecheck + vite build
- `npm run lint` — oxlint
- `npm test` — vitest unit tests
- `npm run test:e2e` — Playwright e2e (spins up the dev server on :5273)
