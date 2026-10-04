# MathQuill typeable symbols

Reference for everything insertable by typing a word in the vendored
MathQuill (`vendor/mathquill`).

Typing `\` opens the `LatexCommandInput`; the word is completed with
Enter/space/non-letter and looked up in the `LatexCmds` table. There are
~480 alphabetic command words registered across
`src/commands/math/{basicSymbols,advancedSymbols,commands,environments}.ts`
and `src/commands/text.ts`, plus ~214 single-character/unicode aliases
(`≤`, `∉`, `→`, `%`, `&`, …) so typing the literal char inserts the
symbol too.

## `\` + word — symbols (no arguments)

### Greek

```
alpha beta gamma Gamma gammad Gammad delta Delta digamma epsilon epsiv
varepsilon zeta eta theta Theta thetasym thetav vartheta iota kappa
kappav varkappa lambda Lambda mu nu xi Xi pi Pi piv varpi rho rhov
varrho sigma Sigma sigmaf sigmav varsigma tau upsi Upsi upsih Upsih
upsilon Upsilon phi Phi phiv varphi chi psi Psi omega Omega
```

### Binary operators

```
amalg ast loast lowast star and land lor or vee wedge cap cup sqcap
sqcup uplus plusminus plusmn pm mp minusplus mnplus times div divide
divides sdot cdot circ circle circledot bull bullet bigcirc odot oplus
ominus otimes oslash Oslash diamond setminus smallsetminus wr bowtie
frown smile triangleleft triangleright slash cross dagger ddagger union
intersect intersection
```

### Relations

```
approx asymp cong simeq sim equiv ne neq ge geq gt gg le leq lt ll prec
preceq succ succeq prop propto models vdash dashv perp perpendicular
parallel mid iff impliedby implies converges diverges doteq in isin ni
contains
```

Negated forms:

```
ncong nsim nless ngtr nparallel notin notni niton notcontains
doesnotcontain
```

### Sub/supersets

```
sub subset sube subeq subsete subseteq sup supset supe supeq supsete
supseteq superset supersete superseteq sqsubset sqsubseteq sqsupset
sqsupseteq
```

Negated forms:

```
nsub nsube nsubeq nsubset nsubsete nsubseteq notsub notsube notsubeq
notsubset notsubsete notsubseteq nsup nsupe nsupeq nsupset nsupsete
nsupseteq nsuperset nsupersete nsuperseteq notsup notsupe notsupeq
notsupset notsupsete notsupseteq notsuperset notsupersete notsuperseteq
```

### Arrows

```
leftarrow Leftarrow larr lArr gets rightarrow Rightarrow rarr rArr to
leftrightarrow Leftrightarrow lrarr lrArr harr hArr uparrow Uparrow uarr
uArr downarrow Downarrow darr dArr updownarrow Updownarrow nearrow
nwarrow searrow swarrow dnarr dnArr dnarrow dnArrow hookleftarrow
hookrightarrow leftharpoondown leftharpoonup rightharpoondown
rightharpoonup longleftarrow Longleftarrow longrightarrow
Longrightarrow longleftrightarrow Longleftrightarrow mapsto
```

### Dots & misc symbols

```
dots cdots ddots vdots ldots ellip ellipsis hellip hellipsis therefore
therefor because cuz alef alefsym aleph alephsym wp ell hbar Im imag
image imagin imaginary Imaginary Re real Real part partial del nabla
infin infinity infty emptyset varnothing nothing exist exists xist xists
nexist nexists forall neg not prime primes Primes dprime degree angle
ang measuredangle parallelogram triangle square surd top bot f flat
natural sharp
clubsuit diamondsuit heartsuit spadesuit backslash vert ring AA o O
angstrom Angstrom pounds space quad qquad emsp tildeNbsp
```

### Set / blackboard names

```
C complex Complex complexes Complexes complexplane Complexplane
ComplexPlane H Hamiltonian N natural naturals Naturals P probability
Probability projective Projective Q quaternions Quaternions R rationals
Rationals reals Reals Z integers Integers
```

### Delimiters (words that insert them)

```
langle rangle lVert rVert vert lbrace rbrace opencurlybrace
closecurlybrace lbrack rbrack lceil rceil lfloor rfloor
```

## `\` + word — commands (take arguments)

```
frac fraction dfrac cfrac sqrt nthroot cbrt binom binomial choose over
subscript superscript supscript derivative sum summation prod product
coprod coproduct int integral oint bigcap bigcup bigodot bigoplus
bigotimes bigsqcup bigtriangledown bigtriangleup biguplus bigvee
bigwedge vec hat dot tilde bar overline underline overarc overleftarrow
overrightarrow overleftrightarrow mathbb mathbf mathit mathrm mathsf
mathtt text textcolor ans percent percentof class editable
MathQuillMathField embed token tokenName left right
```

> `\operatorname{...}` still works (MathQuill knows it) but is
> unsupported — its parse treats the name as an operator, which
> letter-splits (`Im` → `I·m`), lands infix (`x \operatorname{gcd} y`),
> or applies without parens (`Im z` → `Im * z`). Existing emit-side
> handling is kept, but don't recommend it; prefer `\text{...}` or
> `\mathrm{...}` for named functions, which parse as a single atomic
> name.

### Text-style words

```
bold em emph italic italics lowercase sf strong tt uppercase textbf
textit textmd textnormal textrm textsc textsf textsl texttt textup
```

### Environments

```
\begin{matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|displaylines}
```

plus bare forms `\matrix \pmatrix \bmatrix \Bmatrix \vmatrix \Vmatrix
\displaylines`.

## Words typed without `\`

### autoOperatorNames (on by default — render as upright operators)

```
arg deg det dim exp gcd hom inf ker lg lim ln log max min sup limsup
liminf injlim projlim Pr gcf hcf lcm proj span
sin cos tan arcsin arccos arctan sinh cosh tanh sec csc cot coth
```

plus generated `arc`/`h`/`arh`/`arch` variants of
`sin cos tan sec cosec csc cotan cot ctg` (e.g. `arctan`, `sinh`,
`arctanh`).

### autoCommands — app smart mode

`src/editor/attach-field.ts` sets `SMART_AUTO_COMMANDS`:

```
int sum sqrt prod pi infty theta derivative def
```

These complete to the real command without a backslash when smart mode
is on (`autoCommands: ''` disables; upstream's processor throws on
empty strings, the vendored patch allows it).

## Function definitions

`f(x)` reads as `f * x` — parentheses are a factor, not a call or a
signature. To define a function, mark the statement with `\text{def}`
(the `\def` command inserts `\text{def} ` — text block plus a trailing
space, so the caret is ready for the signature):

```
\text{def} g(x) = 2x       →   def g(x): return 2*x
\text{def} f(x)            →   f = sp.Function("f")   (declare, no body)
```

Calls on upright word names still apply: `\mathrm{foo}(x)`,
`\operatorname{foo}(x)`, `\text{foo}(x)`, plus canonical operators
(`\sin(x)`), `f'(x)`, `g^{-1}(x)`, `(x \mapsto x^2)(3)`, and names
bound by `\text{def}`/`f := x \mapsto …` in arithmetic position
(`f + 1` → `f(x) + 1`).
