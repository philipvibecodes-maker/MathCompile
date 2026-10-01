import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

type CaretInfo = {
  value: string;
  where: 'lower' | 'upper' | 'right' | 'left' | 'none';
};

// MathQuill renders the caret as a .mq-cursor element in the light DOM; its
// ancestor chain tells us which block it's in, and DOM position vs the
// operator handles left/right-of-atom. The bound blocks live in different
// containers per operator: \sum wraps its limits inside .mq-large-operator
// (.mq-from/.mq-to), while \int is a bare .mq-int leaf whose bounds are a
// sibling .mq-supsub (.mq-sub/.mq-sup) — either way a field-wide search for
// the block classes finds the one containing the caret.
const caretInfo = (mf: Locator): Promise<CaretInfo> =>
  mf.evaluate((el) => {
    const value = (el as unknown as { value: string }).value;
    const cursor = el.querySelector('.mq-cursor');
    const op =
      el.querySelector('.mq-int') ?? el.querySelector('.mq-large-operator');
    if (!cursor || !op) return { value, where: 'none' };
    if (el.querySelector('.mq-sub, .mq-from')?.contains(cursor))
      return { value, where: 'lower' };
    if (el.querySelector('.mq-sup, .mq-to')?.contains(cursor))
      return { value, where: 'upper' };
    const rel = op.compareDocumentPosition(cursor);
    if (rel & Node.DOCUMENT_POSITION_FOLLOWING)
      return { value, where: 'right' };
    if (rel & Node.DOCUMENT_POSITION_PRECEDING)
      return { value, where: 'left' };
    return { value, where: 'none' };
  });

const settle = (page: Page) => page.waitForTimeout(50);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const mf = page.locator('math-field').first();
  await mf.click();
  await mf.focus();
  await clearFirstCell(page);
});

// `\int` through the latex command input produces a bare integral sign
// with the caret right of it — no bound boxes to escape.
test('\\int lands the caret right of a bare integral sign', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int',
    where: 'right',
  });
});

// The headline flow: an indefinite integral types linearly — the integrand
// lands right of the sign instead of being trapped in a lower-bound box.
test('\\int x^2 dx types an indefinite integral linearly', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('x^2', { delay: 60 });
  await settle(page);
  // `x^2` lands at the baseline (caret inside the exponent).
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int x^{2}',
    where: 'upper',
  });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('dx', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int x^{2}dx');
});

// Bounds are opt-in via `_`/`^`: a sub block grows on demand and `^`
// typed at baseline welds a sup onto the same SupSub.
test('\\int + _ a Right ^ b Right xdx produces \\int_{a}^{b}xdx', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('_a', { delay: 60 });
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{a}',
    where: 'lower',
  });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'right' });
  await mf.pressSequentially('^b', { delay: 60 });
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{a}^{b}',
    where: 'upper',
  });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('xdx', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{b}xdx');
});

test('ArrowLeft from the bare integral moves left of it in one step', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'left' });
});

test('ArrowRight from left of the integral passes it, then enters the sub', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('_a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('^b', { delay: 60 });
  // MQ binds Home/End to the current block; Ctrl+Home reaches the field start.
  await page.keyboard.press('Control+Home');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'left' });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  // A baseline caret stop exists between the sign and its bounds.
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{a}^{b}',
    where: 'right',
  });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'lower' });
});

// A sub-only bound is arrow-skippable at baseline: autoSubscriptNumerals
// (smart mode) treats a lone `_{a}` like `x_1` — Right hops past it rather
// than trapping the caret inside.
test('ArrowRight hops over a lone lower bound (autoSubscriptNumerals)', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('_a', { delay: 60 });
  await page.keyboard.press('Control+Home');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'left' });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await settle(page);
  // Second Right is past the SupSub entirely — never inside it.
  expect(await caretInfo(mf)).toMatchObject({ where: 'right' });
  await mf.pressSequentially('x', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int_{a}x');
});

test('ArrowRight does not hijack in-limit movement', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('_a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('^b', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('x', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{b}x');
  await page.keyboard.press('Control+Home');
  await settle(page);
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'right' });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'lower' });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'lower' });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'upper' });
});

test('ArrowLeft traverses upper -> lower -> right of the integral', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('_a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('^b', { delay: 60 });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'upper' });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'lower' });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'lower' });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'right' });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'left' });
});

test('fast typing: intx lands x right of the integral, not in a bound', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int');
  await page.keyboard.press('Enter');
  await mf.pressSequentially('x');
  const info = await caretInfo(mf);
  expect(info.value).toBe('\\int x');
  expect(info.where).toBe('right');
});

test('ArrowLeft on a plain expression moves one atom', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('x+y', { delay: 60 });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  // Caret between '+' and 'y': typing inserts there.
  await mf.pressSequentially('1', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('x+1y');
});

test('\\sum: multi-atom lower bound then upper', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\sum', { delay: 60 });
  await page.keyboard.press('Enter');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\sum_{ }^{ }',
    where: 'lower',
  });
  await mf.pressSequentially('i=1', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\sum_{i=1}^{ }');
  await page.keyboard.press('ArrowRight');
  await settle(page);
  await mf.pressSequentially('n', { delay: 60 });
  // 'n' landed in the upper bound: ArrowRight reached it.
  expect((await caretInfo(mf)).value).toBe('\\sum_{i=1}^{n}');
});

test('Backspace right of a limits-bearing atom clears a bound at a time', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('_a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('^b', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{a}^{b}',
    where: 'right',
  });
  // autoSubscriptNumerals treats the bounds as one node: the first
  // Backspace deletes the whole lower bound (like x_1), not the upper.
  await page.keyboard.press('Backspace');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int^{b}',
    where: 'right',
  });
  // With no sub left, the next Backspace descends into the upper bound.
  await page.keyboard.press('Backspace');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'upper' });
});

test('Backspace at the start of the field hops over a bounds-carrying atom', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('_a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('^b', { delay: 60 });
  await page.keyboard.press('Control+Home');
  await settle(page);
  await page.keyboard.press('Backspace');
  await settle(page);
  // Nothing to delete on the left: MQ selects the atom rather than
  // deleting past it. A second Backspace would remove it.
  const info = await caretInfo(mf);
  expect(info.value).toBe('\\int_{a}^{b}');
});

test('Tab inside the sub bound reaches the baseline right of the bounds', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('_a', { delay: 60 });
  await page.keyboard.press('Tab');
  await settle(page);
  // No upper bound exists yet — Tab exits the sub to the baseline,
  // where `^` welds one on.
  expect(await caretInfo(mf)).toMatchObject({ where: 'right' });
  await mf.pressSequentially('^b', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{b}');
});

// `\iint` renders the double sign ∬ and `\antid` the single sign ∫ —
// the same boundless leaf as `\int`, via autoCommands or the latex
// command input.
test('iint inserts a boundless double integral, typed linearly', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('iint', { delay: 60 });
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\iint',
    where: 'right',
  });
  await mf.pressSequentially('xdxdy', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\iint xdxdy');
});

test('antid inserts a boundless integral sign', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('antid', { delay: 60 });
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\antid',
    where: 'right',
  });
  // Space stays inside an open exponent, so Right first to reach baseline.
  await mf.pressSequentially('x^2', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('dx', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\antid x^{2}dx');
});

test('\\antid through the latex command input is boundless too', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\antid', { delay: 60 });
  await page.keyboard.press('Enter');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\antid',
    where: 'right',
  });
  await mf.pressSequentially('xdx', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\antid xdx');
});

// `_`/`^` weld a sibling SupSub onto the boundless signs on demand —
// the same definite-integral shape `\iint_{a}^{b}` parses to.
test('\\iint _a Right ^b Right xdx produces \\iint_{a}^{b}xdx', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('iint', { delay: 60 });
  await mf.pressSequentially('_a', { delay: 60 });
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\iint_{a}',
    where: 'lower',
  });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('^b', { delay: 60 });
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\iint_{a}^{b}',
    where: 'upper',
  });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('xdx', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\iint_{a}^{b}xdx');
});
