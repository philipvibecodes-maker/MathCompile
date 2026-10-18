// Commands smart mode auto-executes when typed (MQ autoCommands +
// autoSubscriptNumerals). Pure data, no MathQuill import — the notation
// registry test asserts every name here is a registry `commands`
// spelling, and math-field/attach-field import the list.
// `D` is deliberately absent: a one-letter autoCommand would rewrite
// every typed D — it only expands through the `\D` command input.
// `ode`/`pde` are deliberately absent: a three-letter autoCommand would
// rewrite the tail of typed words like "node"/"mode" — they only expand
// through the `\ode`/`\pde` command input.
export const SMART_AUTO_COMMANDS =
  'int iint antid sum sqrt prod lim pi phi infty theta derivative def nabla gradient solve dsolve pdesolve plot';

// Whole-word commands (MQ autoWordCommands): same insertion alias path
// as autoCommands, but the contiguous letter run must BE the word —
// 'for' expands to \text{ for } while 'before'/'therefore' stay
// ordinary letters. Kept out of SMART_AUTO_COMMANDS because its suffix
// match would rewrite the tail of those words.
export const SMART_WORD_COMMANDS = 'for';
