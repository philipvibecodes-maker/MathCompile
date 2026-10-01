// Minimal typing for the nerdamer surface the calculator's interim
// engine uses (@types/nerdamer doesn't exist).
declare module 'nerdamer/all' {
  export interface NerdamerExpression {
    toString(): string;
    toTeX(): string;
  }
  const nerdamer: {
    (input: string): NerdamerExpression;
    convertFromLaTeX(latex: string): NerdamerExpression;
  };
  export default nerdamer;
}
