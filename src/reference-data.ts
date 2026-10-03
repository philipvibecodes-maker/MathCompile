// Entries for the "How do I…" reference panel. `keys` is the exact
// keystroke recipe (↵ = Enter accepting a \… command input); `preview`
// is rendered via StaticMath so each row shows the result inline;
// `smart` is an alternative recipe that only works with Smart mode on.
export interface RefEntry {
  group: string;
  goal: string;
  keys: string;
  smart?: string;
  preview?: string;
  kw?: string;
}

export const REFERENCE: RefEntry[] = [
  // — Scripts & bounds —
  { group: 'Scripts & bounds', goal: 'subscript', keys: 'x _ 1', preview: 'x_{1}', kw: 'index' },
  { group: 'Scripts & bounds', goal: 'superscript / power', keys: 'x ^ 2', preview: 'x^{2}', kw: 'power exponent square' },
  { group: 'Scripts & bounds', goal: 'multi-char script', keys: 'x _ i + 1 → (exits)', preview: 'x_{i+1}', kw: 'index bound' },
  { group: 'Scripts & bounds', goal: 'prime', keys: "f '", preview: "f'", kw: 'derivative tick apostrophe' },
  { group: 'Scripts & bounds', goal: 'both bounds', keys: '\\int ↵ 0 → ^ 1', preview: '\\int_{0}^{1}', kw: 'limits' },
  // — Fractions & roots —
  { group: 'Fractions & roots', goal: 'fraction', keys: '1 / 2  or  \\frac ↵', smart: 'a b / c', preview: '\\frac{1}{2}', kw: 'divide over' },
  { group: 'Fractions & roots', goal: 'square root', keys: '\\sqrt ↵', smart: 'sqrt x', preview: '\\sqrt{x}', kw: 'radical' },
  { group: 'Fractions & roots', goal: 'nth root', keys: '\\sqrt ↵ [ n → x', preview: '\\sqrt[n]{x}', kw: 'radical cube' },
  { group: 'Fractions & roots', goal: 'binomial coefficient', keys: '\\binom ↵ n Tab k', preview: '\\binom{n}{k}', kw: 'choose' },
  // — Operators —
  { group: 'Operators', goal: 'definite integral', keys: '\\int ↵ a → ^ b → f', smart: 'int a → ^ b', preview: '\\int_{a}^{b}f', kw: 'integral bounds' },
  { group: 'Operators', goal: 'indefinite integral', keys: '\\antid ↵', smart: 'iint', preview: '\\int f', kw: 'integral antiderivative' },
  { group: 'Operators', goal: 'double / triple / closed', keys: '\\iint ↵ · \\iiint ↵ · \\oiint ↵', preview: '\\iiint', kw: 'integral area volume surface' },
  { group: 'Operators', goal: 'summation', keys: '\\sum ↵ i = 0 → ^ n', smart: 'sum i = 0 → ^ n', preview: '\\sum_{i=0}^{n}', kw: 'sigma series' },
  { group: 'Operators', goal: 'product', keys: '\\prod ↵', smart: 'prod', preview: '\\prod_{i=1}^{n}', kw: 'pi' },
  { group: 'Operators', goal: 'limit', keys: '\\lim ↵ x \\to ↵ 0', smart: 'lim x -> 0', preview: '\\lim_{x\\to0}', kw: 'tends approach' },
  { group: 'Operators', goal: 'd/dx derivative', keys: '\\derivative ↵', preview: '\\frac{d}{dx}f', kw: 'diff leibniz' },
  { group: 'Operators', goal: 'partial', keys: '\\partial ↵', preview: '\\partial f', kw: 'del' },
  { group: 'Operators', goal: 'custom operator name', keys: '\\mathop ↵ t r → ( A )', preview: '\\mathop{tr}(A)', kw: 'tr aut hom operatorname' },
  // — Matrices & multi-line —
  { group: 'Matrices & multi-line', goal: 'matrix (parens)', keys: '\\begin{pmatrix} ↵ (caret: row 2 — Up reaches row 1)', preview: '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', kw: 'grid brackets' },
  { group: 'Matrices & multi-line', goal: 'small 2×2 matrix', keys: '\\pmatrix ↵', preview: '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', kw: 'grid' },
  { group: 'Matrices & multi-line', goal: 'matrix row / column', keys: 'Enter = new row · Shift+Space = new column · Ctrl+End = exit', kw: 'grid cell move' },
  { group: 'Matrices & multi-line', goal: 'determinant bars', keys: '\\begin{vmatrix} ↵', preview: '\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}', kw: 'det matrix' },
  { group: 'Matrices & multi-line', goal: 'piecewise cases', keys: '\\begin{cases} ↵ expr → Tab condition · Enter = new case', preview: '\\begin{cases}x&x>0\\\\-x&x<0\\end{cases}', kw: 'defined brace' },
  { group: 'Matrices & multi-line', goal: 'aligned equations', keys: '\\begin{aligned} ↵ col1 → col2 = rhs · Enter = new row', preview: '\\begin{aligned}a&=b\\\\c&=d\\end{aligned}', kw: 'align derivation steps' },
  { group: 'Matrices & multi-line', goal: 'new line in a cell', keys: 'Enter at the baseline', preview: '\\displaylines{a\\\\b}', kw: 'line break displaylines' },
  { group: 'Matrices & multi-line', goal: 'new cell', keys: 'Shift+Enter', kw: 'expression below' },
  // — Pairs & accents —
  { group: 'Pairs & accents', goal: '⟨ ⟩ angle pair', keys: '\\langle ↵ — inserts the whole pair', preview: '\\left\\langle x,y\\right\\rangle', kw: 'inner product expectation' },
  { group: 'Pairs & accents', goal: 'norm ‖x‖', keys: '\\lVert ↵ · or type ‖x‖ unicode', preview: '\\left\\lVert x\\right\\rVert', kw: 'bars' },
  { group: 'Pairs & accents', goal: 'floor / ceiling', keys: '\\lfloor ↵ · \\lceil ↵', preview: '\\left\\lfloor x\\right\\rfloor', kw: 'brackets' },
  { group: 'Pairs & accents', goal: 'restriction f|S', keys: 'f \\vert ↵ _ S', preview: 'f|_{S}', kw: 'evaluate harpoon' },
  { group: 'Pairs & accents', goal: 'evaluation bar', keys: 'x ^ 2 \\vert ↵ _ 1 ^ 2', preview: 'x^{2}|_{1}^{2}', kw: 'evaluate bounds' },
  { group: 'Pairs & accents', goal: 'accents', keys: '\\hat ↵ · \\bar ↵ · \\vec ↵ · \\tilde ↵ · \\dot ↵ · \\ddot ↵', preview: '\\hat{x}\\ \\bar{y}\\ \\vec{v}', kw: 'hat overline vector' },
  { group: 'Pairs & accents', goal: 'under/over brace', keys: '\\underbrace ↵ · \\overbrace ↵', preview: '\\underbrace{xy}_{n}', kw: 'brace group' },
  // — Symbols & fonts —
  { group: 'Symbols & fonts', goal: 'greek', keys: '\\alpha ↵ … \\omega ↵ (or bare word in smart: pi theta)', preview: '\\alpha\\ \\beta\\ \\gamma\\ \\delta', kw: 'letters' },
  { group: 'Symbols & fonts', goal: 'named functions', keys: 'sin cos tan ln log exp lim det ker gcd (bare words, smart on)', preview: '\\sin x', kw: 'function trig' },
  { group: 'Symbols & fonts', goal: 'ℝ ℤ ℕ ℚ ℂ', keys: 'type the unicode char (\\mathbb is broken)', preview: '\\mathbb{R}\\ \\mathbb{Z}', kw: 'real integers blackboard' },
  { group: 'Symbols & fonts', goal: 'calligraphic / fraktur', keys: '\\mathcal ↵ L · \\mathfrak ↵ g · \\mathscr ↵', preview: '\\mathcal{L}\\ \\mathfrak{g}', kw: 'font script' },
  { group: 'Symbols & fonts', goal: 'bold', keys: '\\mathbf ↵ · \\boldsymbol ↵', preview: '\\mathbf{v}', kw: 'font' },
  { group: 'Symbols & fonts', goal: 'upright text', keys: '\\text ↵', preview: '\\text{if }x>0', kw: 'words roman' },
  { group: 'Symbols & fonts', goal: 'infinity / ∇ / ∂', keys: '\\infty ↵ (never bare infty) · \\nabla ↵ · \\partial ↵', preview: '\\infty\\ \\nabla\\ \\partial', kw: 'grad del' },
  { group: 'Symbols & fonts', goal: 'mod congruence', keys: 'x \\equiv ↵ y \\pmod ↵ n', preview: 'x\\equiv y\\pmod{n}', kw: 'modulo' },
  { group: 'Symbols & fonts', goal: 'dots', keys: '\\ldots ↵ · \\cdots ↵ · \\hdots ↵ · \\vdots ↵ · \\ddots ↵', preview: 'a_1+\\cdots+a_n', kw: 'ellipsis' },
  // — Relations, arrows, logic —
  { group: 'Relations & logic', goal: 'set membership', keys: '\\in ↵ · \\ni ↵ · \\notin ↵', preview: 'x\\in S\\ni y', kw: 'element member' },
  { group: 'Relations & logic', goal: 'subsets / unions', keys: '\\subset ↵ \\subseteq ↵ \\cup ↵ \\cap ↵ \\setminus ↵', preview: 'A\\subseteq B\\cup C', kw: 'set union intersect' },
  { group: 'Relations & logic', goal: 'quantifiers & logic', keys: '\\forall ↵ \\exists ↵ \\neg ↵ \\land ↵ \\lor ↵', preview: '\\forall x\\exists y', kw: 'and or not' },
  { group: 'Relations & logic', goal: 'comparisons', keys: '\\leq ↵ \\geq ↵ \\neq ↵ \\approx ↵ \\equiv ↵ \\propto ↵', preview: 'a\\leq b\\neq c\\approx d', kw: 'equal similar' },
  { group: 'Relations & logic', goal: 'arrows', keys: '\\to ↵ · \\mapsto ↵ · \\implies ↵ · \\iff ↵ · \\longrightarrow ↵', preview: 'f\\colon X\\to Y', kw: 'maps' },
  { group: 'Relations & logic', goal: 'labeled arrow', keys: '\\xrightarrow ↵ { f }', preview: '\\xrightarrow{f}', kw: 'over label' },
  { group: 'Relations & logic', goal: 'injection / surjection', keys: '\\hookrightarrow ↵ · \\twoheadrightarrow ↵', preview: '\\hookrightarrow\\ \\twoheadrightarrow', kw: 'embed onto' },
  { group: 'Relations & logic', goal: 'defined-as :=', keys: 'x \\coloneqq ↵ y  or  x := y', preview: 'x:=y', kw: 'assign define' },
  { group: 'Relations & logic', goal: 'negated relations', keys: '\\ne ↵ \\nmid ↵ \\nsubseteq ↵ \\nexists ↵ (not \\not — dead)', preview: 'a\\nmid b', kw: 'not divides' },
  // — Traps —
  { group: 'Traps', goal: 'a block keeps swallowing keys', keys: 'x _ 1 + 1 → x_{1+1} — press → or Tab to exit the bound first', preview: 'x_{1}+1', kw: 'trap bound stuck' },
  { group: 'Traps', goal: "don't type \\rangle or \\rVert", keys: '\\langle ↵ already gives the full pair — a typed close corrupts the cell', kw: 'trap corrupt pair' },
  { group: 'Traps', goal: '\\not + relation does nothing', keys: 'use the dedicated \\nX command: \\ne \\nmid \\nsubseteq \\nexists …', kw: 'trap not' },
  { group: 'Traps', goal: 'bare infty → \\inf ty', keys: 'type \\infty ↵ — smart words split mid-word', kw: 'trap inf' },
  { group: 'Traps', goal: 'auto-ops fire mid-word', keys: "crossings → cros\\sin gs · info → \\inf o · minimum → \\min imum (smart mode)", kw: 'trap words' },
  { group: 'Traps', goal: 'column spec {cc} mangles', keys: '\\begin{array}{} ↵ — leave the spec empty', kw: 'trap array' },
  { group: 'Traps', goal: 'dead commands', keys: '\\operatorname (use \\mathop) · \\restriction (use \\vert/↾) · \\textcolor · \\mathbb+↵ · => · |->', kw: 'trap dead broken' },
  { group: 'Traps', goal: '𝔽 unsupported', keys: 'ℝ ℤ ℕ ℚ ℂ work; 𝔽 drops — no \\mathbb{F} workaround', kw: 'trap unicode' },
];
