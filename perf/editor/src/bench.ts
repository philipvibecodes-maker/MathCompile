// The window.bench contract every backend page exposes. The spec drives
// only this surface (plus real keyboard input on the focused field), so
// both engines get identical measurement.
export interface BenchApi {
  /** Cumulative count of 'input' events dispatched by the fields. */
  inputCount(): number;
  count(): number;
  getValue(i?: number): string;
  setValue(i: number, latex: string): void;
  focus(i: number, edge?: 'start' | 'end'): void;
  /** Append one more field; returns the new total. */
  mountOne(): number;
}

declare global {
  interface Window {
    bench: BenchApi;
  }
}

export const mountPoint = (): HTMLElement =>
  document.getElementById('mount')!;

export const makeInputCounter = (): { bump: () => void; n: () => number } => {
  let n = 0;
  return { bump: () => n++, n: () => n };
};
