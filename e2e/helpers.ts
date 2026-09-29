import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Shared probes for the <math-field> hosts. MathQuill focuses an inner
// <textarea>, not the host element itself — "cell i is focused" means the
// host CONTAINS document.activeElement (equivalently, MQ puts .mq-focused
// on the host). DOM-visible probes only; no framework or editor internals.

export const cell = (page: Page, i: number): Locator =>
  page.locator('math-field').nth(i);

export const cellValue = (mf: Locator): Promise<string> =>
  mf.evaluate((el) => (el as unknown as { getValue(): string }).getValue());

export const focusedIndex = (page: Page): Promise<number> =>
  page.evaluate(() =>
    [...document.querySelectorAll('math-field')].findIndex((f) =>
      f.contains(document.activeElement),
    ),
  );

export const waitFocusedIndex = (page: Page, i: number) =>
  page.waitForFunction(
    (idx) => {
      const f = document.querySelectorAll('math-field')[idx];
      return !!f && f.contains(document.activeElement);
    },
    i,
  );

export const expectCellFocused = (mf: Locator) =>
  expect(mf).toHaveClass(/mq-focused/);

// MathQuill focuses synchronously (no deferred-refocus window like
// MathLive's), but give the textarea a beat before asserting anyway —
// click() on a field resolves before MQ finishes its own focus dance.
export const focusCell = async (page: Page, i: number) => {
  await page.waitForTimeout(60);
  await cell(page, i).focus();
  await waitFocusedIndex(page, i);
};

export type CaretInfo = {
  value: string;
  collapsed: boolean;
  where: 'lower' | 'upper' | 'right' | 'left' | 'none';
  // Rendered text to the left of the caret inside the math — a stand-in
  // for MathLive's model.position. MQ DOM order puts the sup block before
  // the sub block, so '∫ba' means the caret sits after 'a' in the lower
  // bound of \int_{a}^{b}.
  leftText: string;
};

// Reads the rendered caret/selection location relative to the limits-
// bearing operator: \int renders .mq-sup (upper) + .mq-sub (lower) inside
// .mq-int; \sum/\prod render .mq-to/.mq-from inside .mq-large-operator.
// 'right'/'left' are by horizontal position against the op's bounds.
export const caretInfo = (mf: Locator): Promise<CaretInfo> =>
  mf.evaluate((el) => {
    const mq = el as HTMLElement;
    const cursor = mq.querySelector('.mq-cursor');
    const sel = mq.querySelector('.mq-selection');
    const target = cursor ?? sel;
    const op =
      mq.querySelector('.mq-int') ?? mq.querySelector('.mq-large-operator');
    let where: CaretInfo['where'] = 'none';
    if (op && target) {
      const lower =
        op.querySelector('.mq-sub') ?? op.querySelector('.mq-from');
      const upper =
        op.querySelector('.mq-sup') ?? op.querySelector('.mq-to');
      if (lower?.contains(target)) where = 'lower';
      else if (upper?.contains(target)) where = 'upper';
      else if (cursor) {
        // DOM order, not pixel geometry: the supsub box can be wider than
        // the caret x, so a rect comparison misclassifies.
        const pos = op.compareDocumentPosition(cursor);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) where = 'right';
        else if (pos & Node.DOCUMENT_POSITION_PRECEDING) where = 'left';
      }
    }
    let leftText = '';
    const root = mq.querySelector('.mq-root-block');
    if (cursor && root) {
      const r = document.createRange();
      r.setStart(root, 0);
      r.setEndBefore(cursor);
      leftText = (r.cloneContents().textContent ?? '').replace(/​/g, '');
    }
    return {
      value: (mq as unknown as { getValue(): string }).getValue(),
      collapsed: !sel,
      where,
      leftText,
    };
  });
