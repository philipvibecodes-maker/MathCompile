// plotly.js-dist-min ships no types; the app only needs newPlot/purge
// on a div plus plain trace/layout objects (kept loose on purpose —
// the figure spec is data, not a typed API).
declare module 'plotly.js-dist-min' {
  const Plotly: {
    newPlot(
      el: HTMLElement,
      traces: Record<string, unknown>[],
      layout: Record<string, unknown>,
      config?: Record<string, unknown>,
    ): Promise<unknown>;
    purge(el: HTMLElement): void;
  };
  export default Plotly;
}
