import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

type CaretInfo = {
  value: string;
  pos: number;
  collapsed: boolean;
  where: 'lower' | 'upper' | 'right' | 'left' | 'none';
};

// Reads the rendered caret/selection location from the shadow DOM relative
// to the ∫ glyph: lower/upper limit is below/above the op's vertical center;
// right/left of the integral is by horizontal position overlapping the op.
const caretInfo = (mf: Locator): Promise<CaretInfo> =>
  mf.evaluate((el) => {
    const mfEl = el as unknown as {
      getValue(): string;
      _mathfield: { model: { position: number; selectionIsCollapsed: boolean } };
    };
    const r = el.shadowRoot!;
    const group = r.querySelector('.ML__op-group');
    const caretEl = r.querySelector('.ML__caret');
    const selEl =
      r.querySelector('.ML__selected') ?? r.querySelector('.ML__selection');
    let where: CaretInfo['where'] = 'none';
    const target = selEl ?? caretEl;
    if (group && target) {
      // .ML__msubsup's vlist holds the limit boxes; sort by top so [0] is
      // the upper limit and the last is the lower one.
      const msubsup = group.querySelector('.ML__msubsup');
      const boxes = [
        ...(msubsup?.querySelectorAll(
          ':scope > .ML__vlist-t > .ML__vlist-r > .ML__vlist > span',
        ) ?? []),
      ].sort(
        (a, b) =>
          a.getBoundingClientRect().top - b.getBoundingClientRect().top,
      );
      if (boxes[0]?.contains(target)) where = 'upper';
      else if (boxes[1]?.contains(target)) where = 'lower';
      else if (!selEl && caretEl) {
        const g = group.getBoundingClientRect();
        const c = caretEl.getBoundingClientRect();
        if (c.left >= g.right - 0.5) where = 'right';
        else if (c.right <= g.left + 0.5) where = 'left';
      }
    }
    return {
      value: mfEl.getValue(),
      pos: mfEl._mathfield.model.position,
      collapsed: mfEl._mathfield.model.selectionIsCollapsed,
      where,
    };
  });

// MathLive re-renders asynchronously after caret/selection changes; give it
// a tick before reading the shadow DOM.
const settle = (page: Page) => page.waitForTimeout(80);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const mf = page.locator('math-field').first();
  await mf.click();
  await mf.focus();
});

test('int a Right b Right x^2 produces \\int_{a}^{b}x^2 with rendered caret tracking', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('int', { delay: 60 });
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{\\placeholder{}}^{\\placeholder{}}',
    where: 'lower',
  });
  await mf.pressSequentially('a', { delay: 60 });
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{a}^{\\placeholder{}}',
    where: 'lower',
  });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'upper' });
  await mf.pressSequentially('b', { delay: 60 });
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{a}^{b}',
    where: 'upper',
  });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'right' });
  await mf.pressSequentially('x^2', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{b}x^2');
});

test('ArrowLeft twice from lower limit lands left of the integral', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('inta', { delay: 60 });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  const info = await caretInfo(mf);
  expect(info.where).toBe('left');
  expect(info.pos).toBe(0);
});

test('ArrowRight from left of the integral enters the lower limit', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('int', { delay: 60 });
  await page.keyboard.press('Home');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ pos: 0, where: 'left' });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{\\placeholder{}}^{\\placeholder{}}',
    where: 'lower',
  });
  await mf.pressSequentially('a', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{\\placeholder{}}');
});

test('ArrowRight from left of the integral does not hijack in-limit movement', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('int', { delay: 60 });
  await mf.pressSequentially('a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('b', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('x', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{b}x');
  await page.keyboard.press('Home');
  await settle(page);
  expect((await caretInfo(mf)).pos).toBe(0);
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ pos: 3, where: 'lower' });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ pos: 4, where: 'lower' });
});

test('ArrowLeft traverses upper -> lower -> left of the integral', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('inta', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('b', { delay: 60 });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  // Caret before 'b', start of the upper limit.
  expect(await caretInfo(mf)).toMatchObject({ pos: 1, where: 'upper' });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ pos: 4, where: 'lower' });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ pos: 3, where: 'lower' });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ pos: 0, where: 'left' });
});

test('ArrowLeft on the selected upper placeholder goes to the lower limit', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('int', { delay: 60 });
  await mf.pressSequentially('a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  // Upper placeholder selected = caret at the start of the upper limit.
  expect(await caretInfo(mf)).toMatchObject({ where: 'upper' });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{a}^{\\placeholder{}}',
    pos: 4,
    where: 'lower',
  });
});

test('fast typing: inta with zero delay lands a in the lower limit', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('inta');
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{\\placeholder{}}');
});

test('ArrowLeft on a plain expression moves one atom', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('x+y', { delay: 60 });
  const before = (await caretInfo(mf)).pos;
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect((await caretInfo(mf)).pos).toBe(before - 1);
});

test('sum template: multi-atom lower bound then upper', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('sum', { delay: 60 });
  await settle(page);
  // \sum renders limits as over/under (not msubsup), so `where` can't see
  // the caret — a non-collapsed selection plus what typing fills is the proof.
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\sum_{\\placeholder{}}^{\\placeholder{}}',
    collapsed: false,
  });
  await mf.pressSequentially('i=1', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\sum_{i=1}^{\\placeholder{}}');
  await page.keyboard.press('ArrowRight');
  await settle(page);
  await mf.pressSequentially('n', { delay: 60 });
  // 'n' landed in the upper bound: ArrowRight reached it.
  expect((await caretInfo(mf)).value).toBe('\\sum_{i=1}^{n}');
});

test('Backspace right of a limits-bearing atom lands in the upper limit', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('inta', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('b', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{a}^{b}',
    where: 'right',
  });
  await page.keyboard.press('Backspace');
  await settle(page);
  // MathLive would descend into the lower bound first; the fix sends the
  // caret to the last bound in reading order — the upper one.
  const info = await caretInfo(mf);
  expect(info.where).toBe('upper');
  expect(info.value).toBe('\\int_{a}^{b}');
});

test('Backspace at the start of the field hops over a bounds-carrying atom', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('inta', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('b', { delay: 60 });
  await page.keyboard.press('Home');
  await settle(page);
  expect((await caretInfo(mf)).pos).toBe(0);
  await page.keyboard.press('Backspace');
  await settle(page);
  // Nothing to delete on the left, so the caret hops over the bounds.
  const info = await caretInfo(mf);
  expect(info.value).toBe('\\int_{a}^{b}');
  expect(info.where).toBe('right');
});

test('Tab advances the placeholder selection lower -> upper', async ({
  page,
}) => {
  // The intent reducer owns Tab (MathLive's competing binding is
  // prevented), so the selection can't be yanked back to the lower bound.
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('int', { delay: 60 });
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'lower' });
  await page.keyboard.press('Tab');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'upper' });
  await mf.pressSequentially('a', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe(
    '\\int_{\\placeholder{}}^{a}',
  );
});
