// The canned prompt the "copy agent prompt" affordances put on the
// clipboard. It points at CUSTOM-FUNCTIONS.md rather than inlining the
// doc, so it stays short and always matches the shipped version.
export const CUSTOM_FUNCTIONS_DOC_URL =
  'https://github.com/philipvibecodes-maker/MathCompile/blob/main/CUSTOM-FUNCTIONS.md';

export const AGENT_PROMPT =
  `I use MathCompile, a LaTeX math worksheet app that compiles cells to ` +
  `SymPy Python running in the browser. It supports user-defined ` +
  `functions without forking — the convention (Python cells, # @latex ` +
  `aliases, \\mathrm{name}(x) call sites, \\newcommand macros) is ` +
  `documented at ${CUSTOM_FUNCTIONS_DOC_URL} — read that doc, then ` +
  `give me the worksheet cells (Python and/or LaTeX) I should paste in ` +
  `to define a custom function that does what I describe next. ` +
  `Remember: my worksheet namespace already runs "from sympy import *" ` +
  `(with "import sympy as sp" as an alternative mode, so "sp."-qualified ` +
  `code is safest), and call-site arguments reach the def as whatever ` +
  `the call compiles to — SymPy objects for symbols/exprs/matrices, ` +
  `Python int/float for literal numbers:`;

// A denied clipboard write rejects the promise — swallow it so the
// click never throws.
export const copyAgentPrompt = () =>
  navigator.clipboard.writeText(AGENT_PROMPT).catch(() => {});
