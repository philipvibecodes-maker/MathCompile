// Cold-load metrics: navigation start -> first cell painted / interactive,
// plus transfer-size and heap baselines. Fresh page per iteration so every
// sample is a true cold document load (browser-level caches shared, as they
// would be for a returning user).

import { test } from '@playwright/test';
import { flush, record } from './measure';
import { SEL } from './contract';

const LOADS = 5;

test.afterAll(() => flush('startup'));

test('cold load: first cell painted, interactive, bytes, heap', async ({
  browser,
}) => {
  for (let i = 0; i < LOADS; i++) {
    const page = await browser.newPage();
    try {
      // 'commit' resolves at first byte; all timing is in-page after that.
      await page.goto('/', { waitUntil: 'commit' });
      const t = await page.evaluate(async (cellSel) => {
        await new Promise<void>((res) => {
          if (document.querySelector(cellSel)) return res();
          new MutationObserver((_, obs) => {
            if (document.querySelector(cellSel)) {
              obs.disconnect();
              res();
            }
          }).observe(document.documentElement, {
            childList: true,
            subtree: true,
          });
        });
        const painted = await new Promise<number>((res) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => res(performance.now())),
          ),
        );
        const interactive = await new Promise<number>((res) => {
          const check = () =>
            document.activeElement?.closest(cellSel)
              ? res(performance.now())
              : requestAnimationFrame(check);
          check();
        });
        const nav = performance.getEntriesByType(
          'navigation',
        )[0] as PerformanceNavigationTiming;
        const res = performance.getEntriesByType(
          'resource',
        ) as PerformanceResourceTiming[];
        const jsBytes = res
          .filter((r) => r.initiatorType === 'script')
          .reduce((a, r) => a + (r.transferSize || r.encodedBodySize), 0);
        const allBytes = res.reduce(
          (a, r) => a + (r.transferSize || r.encodedBodySize),
          0,
        );
        const heapMB =
          (performance as unknown as { memory?: { usedJSHeapSize: number } })
            .memory?.usedJSHeapSize ?? 0;
        return {
          painted,
          interactive,
          dcl: nav.domContentLoadedEventEnd,
          load: nav.loadEventEnd,
          jsBytes,
          allBytes,
          heapMB: heapMB / 1024 / 1024,
        };
      }, SEL.cell);
      record('startup.paint', t.painted);
      record('startup.interactive', t.interactive);
      record('startup.domcontentloaded', t.dcl);
      record('startup.load', t.load);
      record('startup.js-bytes', t.jsBytes);
      record('startup.all-bytes', t.allBytes);
      record('startup.heap-MB', t.heapMB);
    } finally {
      await page.close();
    }
  }
});
