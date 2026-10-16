// echarts-gl ships no types — the loader only needs the plugin entries
// for echarts.use() (kept loose on purpose, like plotly.d.ts).
declare module 'echarts-gl/charts' {
  export const Line3DChart: unknown;
  export const Scatter3DChart: unknown;
  export const SurfaceChart: unknown;
}
declare module 'echarts-gl/components' {
  export const Grid3DComponent: unknown;
}
