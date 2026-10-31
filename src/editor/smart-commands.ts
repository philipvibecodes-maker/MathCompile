// Commands smart mode auto-executes when typed (MQ autoCommands +
// autoSubscriptNumerals). Pure data, no MathQuill import — the notation
// registry test asserts every name here is a registry `commands`
// spelling, and math-field/attach-field import the list.
// `D` is deliberately absent: a one-letter autoCommand would rewrite
// every typed D — it only expands through the `\D` command input.
// `ode`/`pde` are deliberately absent: a three-letter autoCommand would
// rewrite the tail of typed words like "node"/"mode" — they only expand
// through the `\ode`/`\pde` command input. `for` accepts the same risk
// ("befor" tails) — the domain keyword earns its place next to the
// other statement markers.
export const SMART_AUTO_COMMANDS =
  'int iint antid sum sqrt prod lim pi phi infty theta derivative def nabla gradient solve dsolve pdesolve plot for where st';
