import { mq3 } from './editor/mathquill';
import { defineMathField, type MathFieldElement } from './editor/math-field';

const el = document.getElementById('field')!;
const logEl = document.getElementById('log')!;
const events: string[] = [];
const results: Record<string, unknown> = {};

function log(msg: string) {
  events.push(msg);
  logEl.textContent = events.join('\n');
}

const mq = mq3.MathField(el, {
  autoCommands: 'int sum sqrt prod pi infty theta',
  handlers: {
    enter: () => log('handler:enter'),
    upOutOf: () => log('handler:upOutOf'),
    downOutOf: () => log('handler:downOutOf'),
    moveOutOf: (dir) => log(`handler:moveOutOf:${dir}`),
    edit: () => log('handler:edit'),
  },
});

// Adapter element: Phase 2 contract — value round-trip, input/move-out/
// new-cell events, Enter -> insertLineBreak default.
defineMathField();
const adapterEl = document.getElementById('adapter-field') as MathFieldElement;
adapterEl.options = {
  autoCommands: 'int sum sqrt prod pi infty theta derivative',
};
adapterEl.addEventListener('input', () => log('adapter:input'));
adapterEl.addEventListener('move-out', (e) =>
  log(`adapter:move-out:${(e as CustomEvent).detail.direction}`),
);
adapterEl.addEventListener('new-cell', () => log('adapter:new-cell'));

// Capture-phase keydown on the field container: sees the event (and its
// shiftKey) before MQ's hidden textarea handles it — needed so the app can
// distinguish Enter vs Shift+Enter ahead of MQ's 'enter' hook.
el.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Enter') log(`capture:enter shift=${e.shiftKey}`);
    if (e.key === ' ') log(`capture:space shift=${e.shiftKey}`);
  },
  true,
);

// Track focus stealing: record every activeElement change for ~250ms after
// we hand focus elsewhere.
let focusWatch: { t: number; tag: string; id: string }[] = [];
let focusTimer: ReturnType<typeof setInterval> | undefined;
function watchFocus() {
  focusWatch = [];
  clearInterval(focusTimer);
  const t0 = Date.now();
  let last = document.activeElement;
  focusTimer = setInterval(() => {
    const cur = document.activeElement;
    if (cur !== last) {
      focusWatch.push({
        t: Date.now() - t0,
        tag: cur?.tagName ?? '',
        id: (cur as HTMLElement)?.id ?? '',
      });
      last = cur;
    }
    if (Date.now() - t0 > 250) clearInterval(focusTimer);
  }, 4);
}

declare global {
  interface Window {
    spike: unknown;
  }
}
window.spike = {
  mq,
  el,
  events,
  results,
  watchFocus,
  getFocusWatch: () => focusWatch,
  adapter: adapterEl,
};
