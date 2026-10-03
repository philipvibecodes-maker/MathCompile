import { TARGETS } from './compile/targets';
import type { AppStore } from './state/store.svelte';

export interface Command {
  id: string;
  title: string;
  hint?: string;
  current?: boolean;
  keywords?: string;
  // Overrides the fuzzy-matched text (`${title} ${keywords}` by default).
  // Insert commands need it: every title starts with 'Insert', so the
  // query's 'insert' token would match all of them equally and ranking
  // would collapse to keyword noise.
  search?: string;
  run: () => void;
}

// The command list reads the store directly; wrap the call in $derived at
// the callsite so the (always-mounted) palette only recomputes it when the
// underlying state changes.
// Insert commands: each seq is the exact keystroke sequence a user would
// type ('\n' accepts an open \… command input; '{…}' and unicode chars go
// through the same paths real typing does). The hint column doubles as a
// reminder of how to type it by hand.
interface Insertable {
  id: string;
  title: string;
  seq: string;
  hint: string;
  keywords: string;
}
const INSERTABLES: Insertable[] = [
  // Structures
  { id: 'int', title: 'Insert ∫ definite integral', seq: '\\int\n', hint: '\\int ↵', keywords: 'integral int bound limits' },
  { id: 'antid', title: 'Insert ∫ indefinite integral', seq: '\\antid\n', hint: '\\antid ↵', keywords: 'integral antiderivative int indefinite' },
  { id: 'iint', title: 'Insert ∬ double integral', seq: '\\iint\n', hint: '\\iint ↵', keywords: 'integral double area' },
  { id: 'sum', title: 'Insert ∑ summation', seq: '\\sum\n', hint: '\\sum ↵', keywords: 'sum sigma series' },
  { id: 'prod', title: 'Insert ∏ product', seq: '\\prod\n', hint: '\\prod ↵', keywords: 'product pi' },
  { id: 'lim', title: 'Insert lim limit', seq: '\\lim\n', hint: '\\lim ↵', keywords: 'limit tends approach' },
  { id: 'derivative', title: 'Insert d/dx derivative', seq: '\\derivative\n', hint: '\\derivative ↵', keywords: 'derivative diff ddx' },
  { id: 'sqrt', title: 'Insert √ square root', seq: '\\sqrt\n', hint: '\\sqrt ↵', keywords: 'root radical square' },
  { id: 'binom', title: 'Insert (n k) binomial', seq: '\\binom\n', hint: '\\binom ↵', keywords: 'binomial choose coefficient' },
  { id: 'pmatrix', title: 'Insert ( ) matrix', seq: '\\begin{pmatrix}\n', hint: '\\begin{pmatrix} ↵', keywords: 'matrix parentheses grid array' },
  { id: 'bmatrix', title: 'Insert [ ] matrix', seq: '\\begin{bmatrix}\n', hint: '\\begin{bmatrix} ↵', keywords: 'matrix brackets grid' },
  { id: 'vmatrix', title: 'Insert | | determinant', seq: '\\begin{vmatrix}\n', hint: '\\begin{vmatrix} ↵', keywords: 'determinant matrix bars' },
  { id: 'cases', title: 'Insert { piecewise cases', seq: '\\begin{cases}\n', hint: '\\begin{cases} ↵', keywords: 'piecewise cases brace defined' },
  { id: 'aligned', title: 'Insert aligned rows', seq: '\\begin{aligned}\n', hint: '\\begin{aligned} ↵', keywords: 'align aligned multiline derivation steps' },
  { id: 'langle', title: 'Insert ⟨ ⟩ pair', seq: '\\langle\n', hint: '\\langle ↵', keywords: 'angle brackets inner product expect' },
  { id: 'lfloor', title: 'Insert ⌊ ⌋ floor pair', seq: '\\lfloor\n', hint: '\\lfloor ↵', keywords: 'floor brackets' },
  { id: 'lceil', title: 'Insert ⌈ ⌉ ceiling pair', seq: '\\lceil\n', hint: '\\lceil ↵', keywords: 'ceiling ceil brackets' },
  { id: 'vec', title: 'Insert v⃗ vector accent', seq: '\\vec\n', hint: '\\vec ↵', keywords: 'vector arrow accent' },
  { id: 'hat', title: 'Insert x̂ hat accent', seq: '\\hat\n', hint: '\\hat ↵', keywords: 'hat accent unit' },
  { id: 'overline', title: 'Insert x̅ bar accent', seq: '\\overline\n', hint: '\\overline ↵', keywords: 'bar overline conjugate accent' },
  { id: 'tilde', title: 'Insert x̃ tilde accent', seq: '\\tilde\n', hint: '\\tilde ↵', keywords: 'tilde accent' },
  { id: 'pmod', title: 'Insert (mod n)', seq: '\\pmod\n', hint: '\\pmod ↵', keywords: 'mod modulo congruence' },
  { id: 'xrightarrow', title: 'Insert ⟶ labeled arrow', seq: '\\xrightarrow{f}\n', hint: '\\xrightarrow{f} ↵', keywords: 'arrow label over tends' },
  // Symbols
  { id: 'alpha', title: 'Insert α alpha', seq: '\\alpha\n', hint: '\\alpha ↵', keywords: 'greek alpha' },
  { id: 'beta', title: 'Insert β beta', seq: '\\beta\n', hint: '\\beta ↵', keywords: 'greek beta' },
  { id: 'gamma', title: 'Insert γ gamma', seq: '\\gamma\n', hint: '\\gamma ↵', keywords: 'greek gamma' },
  { id: 'delta', title: 'Insert δ delta', seq: '\\delta\n', hint: '\\delta ↵', keywords: 'greek delta' },
  { id: 'epsilon', title: 'Insert ε epsilon', seq: '\\varepsilon\n', hint: '\\varepsilon ↵', keywords: 'greek epsilon' },
  { id: 'theta', title: 'Insert θ theta', seq: '\\theta\n', hint: '\\theta ↵', keywords: 'greek theta angle' },
  { id: 'lambda', title: 'Insert λ lambda', seq: '\\lambda\n', hint: '\\lambda ↵', keywords: 'greek lambda eigenvalue' },
  { id: 'mu', title: 'Insert μ mu', seq: '\\mu\n', hint: '\\mu ↵', keywords: 'greek mu' },
  { id: 'pi-sym', title: 'Insert π pi', seq: '\\pi\n', hint: '\\pi ↵', keywords: 'greek pi' },
  { id: 'rho', title: 'Insert ρ rho', seq: '\\rho\n', hint: '\\rho ↵', keywords: 'greek rho' },
  { id: 'sigma', title: 'Insert σ sigma', seq: '\\sigma\n', hint: '\\sigma ↵', keywords: 'greek sigma' },
  { id: 'tau', title: 'Insert τ tau', seq: '\\tau\n', hint: '\\tau ↵', keywords: 'greek tau' },
  { id: 'phi', title: 'Insert φ phi', seq: '\\varphi\n', hint: '\\varphi ↵', keywords: 'greek phi' },
  { id: 'omega', title: 'Insert ω omega', seq: '\\omega\n', hint: '\\omega ↵', keywords: 'greek omega' },
  { id: 'infty', title: 'Insert ∞ infinity', seq: '\\infty\n', hint: '\\infty ↵', keywords: 'infinity inf' },
  { id: 'partial', title: 'Insert ∂ partial', seq: '\\partial\n', hint: '\\partial ↵', keywords: 'partial derivative del' },
  { id: 'nabla', title: 'Insert ∇ nabla', seq: '\\nabla\n', hint: '\\nabla ↵', keywords: 'nabla grad gradient del' },
  { id: 'pm', title: 'Insert ± plus-minus', seq: '\\pm\n', hint: '\\pm ↵', keywords: 'plus minus' },
  { id: 'times', title: 'Insert × times', seq: '\\times\n', hint: '\\times ↵', keywords: 'times cross multiply' },
  { id: 'cdot', title: 'Insert · cdot', seq: '\\cdot\n', hint: '\\cdot ↵', keywords: 'dot cdot multiply' },
  { id: 'circ', title: 'Insert ∘ composition', seq: '\\circ\n', hint: '\\circ ↵', keywords: 'circ compose composition' },
  { id: 'leq', title: 'Insert ≤ leq', seq: '\\leq\n', hint: '\\leq ↵', keywords: 'leq less equal le' },
  { id: 'geq', title: 'Insert ≥ geq', seq: '\\geq\n', hint: '\\geq ↵', keywords: 'geq greater equal ge' },
  { id: 'neq', title: 'Insert ≠ neq', seq: '\\neq\n', hint: '\\neq ↵', keywords: 'neq not equal' },
  { id: 'approx', title: 'Insert ≈ approx', seq: '\\approx\n', hint: '\\approx ↵', keywords: 'approx approximately' },
  { id: 'propto', title: 'Insert ∝ proportional', seq: '\\propto\n', hint: '\\propto ↵', keywords: 'propto proportional' },
  { id: 'equiv', title: 'Insert ≡ equiv', seq: '\\equiv\n', hint: '\\equiv ↵', keywords: 'equiv congruent identical' },
  { id: 'sim', title: 'Insert ∼ sim', seq: '\\sim\n', hint: '\\sim ↵', keywords: 'sim similar asymptotic' },
  { id: 'in', title: 'Insert ∈ element of', seq: '\\in\n', hint: '\\in ↵', keywords: 'in element member set' },
  { id: 'subset', title: 'Insert ⊂ subset', seq: '\\subset\n', hint: '\\subset ↵', keywords: 'subset set' },
  { id: 'subseteq', title: 'Insert ⊆ subseteq', seq: '\\subseteq\n', hint: '\\subseteq ↵', keywords: 'subset equal set' },
  { id: 'cup', title: 'Insert ∪ union', seq: '\\cup\n', hint: '\\cup ↵', keywords: 'cup union set' },
  { id: 'cap', title: 'Insert ∩ intersection', seq: '\\cap\n', hint: '\\cap ↵', keywords: 'cap intersect intersection set' },
  { id: 'setminus', title: 'Insert ∖ setminus', seq: '\\setminus\n', hint: '\\setminus ↵', keywords: 'setminus difference set' },
  { id: 'forall', title: 'Insert ∀ for all', seq: '\\forall\n', hint: '\\forall ↵', keywords: 'forall every quantifier' },
  { id: 'exists', title: 'Insert ∃ exists', seq: '\\exists\n', hint: '\\exists ↵', keywords: 'exists some quantifier' },
  { id: 'to', title: 'Insert → to arrow', seq: '\\to\n', hint: '\\to ↵', keywords: 'to arrow map right' },
  { id: 'mapsto', title: 'Insert ↦ mapsto', seq: '\\mapsto\n', hint: '\\mapsto ↵', keywords: 'mapsto maps arrow function' },
  { id: 'implies', title: 'Insert ⇒ implies', seq: '\\implies\n', hint: '\\implies ↵', keywords: 'implies therefore then' },
  { id: 'iff', title: 'Insert ⇔ iff', seq: '\\iff\n', hint: '\\iff ↵', keywords: 'iff equivalent if and only' },
  { id: 'neg', title: 'Insert ¬ not', seq: '\\neg\n', hint: '\\neg ↵', keywords: 'neg not logic' },
  { id: 'land', title: 'Insert ∧ and', seq: '\\land\n', hint: '\\land ↵', keywords: 'land and wedge logic' },
  { id: 'lor', title: 'Insert ∨ or', seq: '\\lor\n', hint: '\\lor ↵', keywords: 'lor or vee logic' },
  { id: 'perp', title: 'Insert ⊥ perp', seq: '\\perp\n', hint: '\\perp ↵', keywords: 'perp perpendicular orthogonal' },
  { id: 'parallel', title: 'Insert ∥ parallel', seq: '\\parallel\n', hint: '\\parallel ↵', keywords: 'parallel' },
  { id: 'mid', title: 'Insert ∣ mid', seq: '\\mid\n', hint: '\\mid ↵', keywords: 'mid divides such that' },
  { id: 'ell', title: 'Insert ℓ ell', seq: '\\ell\n', hint: '\\ell ↵', keywords: 'ell script l' },
  { id: 'aleph', title: 'Insert ℵ aleph', seq: '\\aleph\n', hint: '\\aleph ↵', keywords: 'aleph cardinality' },
  { id: 'hbar', title: 'Insert ℏ hbar', seq: '\\hbar\n', hint: '\\hbar ↵', keywords: 'hbar planck' },
  { id: 're', title: 'Insert ℜ Re', seq: '\\Re\n', hint: '\\Re ↵', keywords: 'real part' },
  { id: 'im', title: 'Insert ℑ Im', seq: '\\Im\n', hint: '\\Im ↵', keywords: 'imaginary part' },
  { id: 'emptyset', title: 'Insert ∅ empty set', seq: '\\varnothing\n', hint: '\\varnothing ↵', keywords: 'empty set null' },
  { id: 'mathbb-r', title: 'Insert ℝ reals', seq: 'ℝ', hint: 'ℝ', keywords: 'real numbers blackboard mathbb r' },
  { id: 'mathbb-z', title: 'Insert ℤ integers', seq: 'ℤ', hint: 'ℤ', keywords: 'integers blackboard mathbb z' },
  { id: 'mathbb-n', title: 'Insert ℕ naturals', seq: 'ℕ', hint: 'ℕ', keywords: 'natural numbers blackboard mathbb n' },
  { id: 'mathbb-q', title: 'Insert ℚ rationals', seq: 'ℚ', hint: 'ℚ', keywords: 'rational numbers blackboard mathbb q' },
  { id: 'mathbb-c', title: 'Insert ℂ complex', seq: 'ℂ', hint: 'ℂ', keywords: 'complex numbers blackboard mathbb c' },
];

export const buildCommands = (store: AppStore): Command[] => {
  const focusId = store.focusedId;
  return [
    ...INSERTABLES.map((ins) => ({
      id: `insert-${ins.id}`,
      title: ins.title,
      hint: ins.hint,
      // Title minus 'Insert ' + a single shared 'insert' keyword: every
      // entry matches 'insert <thing>' queries, but ranking is decided by
      // the rest of the query hitting the real name — title words can't
      // act as a bridge into keyword noise.
      search: `${ins.title.replace(/^Insert /, '')} insert ${ins.keywords}`,
      keywords: ins.keywords,
      run: () => {
        const h = store.fields.get(focusId);
        h?.focus();
        h?.type(ins.seq);
      },
    })),
    {
      id: 'insert-below',
      title: 'Insert expression below',
      keywords: 'new add cell row',
      hint: 'Shift+Enter',
      run: () => store.addCell(focusId),
    },
    {
      id: 'duplicate',
      title: 'Duplicate current expression',
      keywords: 'copy clone cell',
      run: () => store.duplicateCell(focusId),
    },
    {
      id: 'delete-current',
      title: 'Delete current expression',
      keywords: 'remove cell',
      run: () => store.deleteFocused(),
    },
    {
      id: 'clear-all',
      title: 'Clear all expressions',
      keywords: 'reset delete remove',
      run: () => store.clearAll(),
    },
    {
      id: 'toggle-smart',
      title: 'Smart mode',
      keywords: 'toggle option autocomplete',
      current: store.smartMode,
      run: () => (store.smartMode = !store.smartMode),
    },
    {
      id: 'toggle-dark',
      title: 'Dark mode',
      keywords: 'toggle theme appearance light night',
      current: store.darkMode,
      run: () => (store.darkMode = !store.darkMode),
    },
    ...TARGETS.filter((t) => t.enabled).map((t) => ({
      id: `target-${t.id}`,
      title: `Target: ${t.label}`,
      keywords: 'set compile codegen language output',
      current: t.id === store.target,
      run: () => (store.target = t.id),
    })),
    ...store.cells.map((e, i) => ({
      id: `goto-${e.id}`,
      title: `Go to expression ${i + 1}: ${e.latex.trim() || '(empty)'}`,
      keywords: 'focus jump cell',
      run: () => store.focusCell(e.id, 'end' as const),
    })),
  ];
};
