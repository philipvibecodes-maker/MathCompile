// Shared measurement harness for the perf battery.
//
// Everything is timed in-page so results are identical in meaning no matter
// what framework produced the DOM:
//
//   t0 = event.timeStamp of the real keydown/mousedown — recorded by a
//        capture-phase listener installed before the app scripts run — i.e.
//        "input received". Falls back to performance.now() taken just before
//        the action for inputs that produce no such event (selectOption).
//   t1 = performance.now() after the DOM-visible outcome + 2 nested rAFs —
//        i.e. the frame where the outcome has actually painted.
//
// The delta includes framework dispatch + update + layout + paint, exactly
// the latency a user perceives. Async, multi-frame work is captured too —
// the until() predicate waits for the outcome, not the event handler.

import type { Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where result JSON lands: perf-results/<PERF_LABEL>/<suite>.json */
export const OUT_DIR = process.env.PERF_OUT ?? 'perf-results';

const gitLabel = () => {
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
    }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' })
      .trim()
      ? '-dirty'
      : '';
    return sha + dirty;
  } catch {
    return 'run';
  }
};

/** Label for this run. Set PERF_LABEL per implementation (svelte, solid…). */
export const LABEL = (process.env.PERF_LABEL ?? gitLabel()).replace(
  /[^\w.-]+/g,
  '_',
);

// Installs a capture-phase listener before app code runs. Same clock as
// performance.now() in Chromium, and it catches events inside <math-field>'s
// shadow DOM listeners since capture on window runs first.
export const installInputClock = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const w = window as unknown as { __inputClock: number[] };
    w.__inputClock = [];
    for (const type of ['keydown', 'mousedown'])
      window.addEventListener(
        type,
        (e) => w.__inputClock.push(e.timeStamp),
        true,
      );
  });
};

// performance.now() read inside the Nth nested rAF — i.e. after the pending
// frame has produced (and typically one full paint beyond the outcome frame).
export const nextPaint = (page: Page, frames = 2): Promise<number> =>
  page.evaluate(
    (n) =>
      new Promise<number>((resolve) => {
        const step = (left: number) =>
          left <= 0
            ? resolve(performance.now())
            : requestAnimationFrame(() => step(left - 1));
        step(n);
      }),
    frames,
  );

export interface Timing {
  /** t0 → paint of the settled DOM (what callers record). */
  ms: number;
  /** Absolute t0 — reused when one action yields several metrics. */
  t0: number;
}

export async function timed(
  page: Page,
  act: () => Promise<unknown>,
  opts: {
    until?: () => Promise<unknown>;
    frames?: number;
    /** Cap on waiting for the outcome; a stuck condition fails fast instead
     *  of consuming the whole test timeout. */
    outcomeTimeout?: number;
  } = {},
): Promise<Timing> {
  await page.evaluate(() => {
    const w = window as unknown as { __inputClock?: number[] };
    (w.__inputClock ??= []).length = 0;
  });
  const fallback = page.evaluate(() => performance.now());
  await act();
  if (opts.until) {
    let timer: ReturnType<typeof setTimeout>;
    await Promise.race([
      opts.until(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('timed: outcome never became true')),
          opts.outcomeTimeout ?? 15_000,
        );
      }),
    ]).finally(() => clearTimeout(timer!));
  }
  const t1 = await nextPaint(page, opts.frames ?? 2);
  const logged = await page.evaluate(
    () => (window as unknown as { __inputClock?: number[] }).__inputClock?.[0],
  );
  const t0 = logged ?? (await fallback);
  return { ms: t1 - t0, t0 };
}

// ---------------------------------------------------------------------------
// Collection & reporting

const samples = new Map<string, number[]>();

export const record = (metric: string, ms: number) => {
  const arr = samples.get(metric);
  if (arr) arr.push(ms);
  else samples.set(metric, [ms]);
};

const round = (x: number) => Math.round(x * 100) / 100;

export const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) =>
    s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
  return {
    n: s.length,
    min: round(s[0]),
    p50: round(q(0.5)),
    p95: round(q(0.95)),
    max: round(s[s.length - 1]),
    mean: round(s.reduce((a, b) => a + b, 0) / s.length),
    samples: xs.map(round),
  };
};

// Call once per spec file (afterAll): writes <OUT_DIR>/<LABEL>/<suite>.json
// and echoes a table. Perf runs are workers:1, so a module-level map is safe.
export function flush(suite: string) {
  if (samples.size === 0) return;
  const metrics = Object.fromEntries(
    [...samples].map(([k, v]) => [k, stats(v)]),
  );
  const dir = join(OUT_DIR, LABEL);
  mkdirSync(dir, { recursive: true });
  const file = join(
    dir,
    `${suite}-w${process.env.TEST_WORKER_INDEX ?? '0'}.json`,
  );
  writeFileSync(
    file,
    JSON.stringify(
      { label: LABEL, suite, ts: new Date().toISOString(), metrics },
      null,
      2,
    ),
  );
  console.log(`\nperf results (${LABEL}) -> ${file}`);
  for (const [name, s] of Object.entries(metrics))
    console.log(
      `  ${name.padEnd(46)} p50=${String(s.p50).padStart(8)}  p95=${String(
        s.p95,
      ).padStart(8)}  n=${s.n}`,
    );
  samples.clear();
}
