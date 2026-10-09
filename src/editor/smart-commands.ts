// Commands smart mode auto-executes when typed (MQ autoCommands +
// autoSubscriptNumerals). Pure data, no MathQuill import — the notation
// registry test asserts every name here is a registry `commands`
// spelling, and math-field/attach-field import the list.
// `D` is deliberately absent: a one-letter autoCommand would rewrite
// every typed D — it only expands through the `\D` command input.
export const SMART_AUTO_COMMANDS =
  'int iint antid sum sqrt prod lim pi infty theta derivative def nabla gradient';
