import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clearFirstCell } from './helpers';

type CaretInfo = {
  value: string;
  where: 'lower' | 'upper' | 'right' | 'left' | 'none';
};

// MathQuill renders the caret as a .mq-cursor element in the light DOM; its
// ancestor chain tells us which block it's in (.mq-sub/.mq-sup inside the
// operator), and DOM position vs the operator handles left/right-of-atom.
const caretInfo = (mf: Locator): Promise<CaretInfo> =>
  mf.evaluate((el) => {
    const value = (el as unknown as { value: string }).value;
    const cursor = el.querySelector('.mq-cursor');
    // The bounds-bearing atom: \int renders .mq-int; \sum renders a
    // .mq-large-operator (over/under limits).
    const op =
      el.querySelector('.mq-int') ?? el.querySelector('.mq-large-operator');
    if (!cursor || !op) return { value, where: 'none' };
    // Bounds may be child blocks of the atom (bounded \int / \sum) or an
    // on-demand sibling .mq-supsub (boundless \iint / \antid): check the
    // whole field for the bound block that contains the caret.
    const bound =
      el.querySelector('.mq-supsub .mq-sub') ??
      el.querySelector('.mq-sub, .mq-from');
    if (bound?.contains(cursor)) return { value, where: 'lower' };
    const upper =
      el.querySelector('.mq-supsub .mq-sup') ??
      el.querySelector('.mq-sup, .mq-to');
    if (upper?.contains(cursor)) return { value, where: 'upper' };
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

// `\int` through the latex command input: Enter accepts it and lands the
// caret in the lower bound (MathQuill visits sub before sup).
test('\\int a Right b Right x^2 produces \\int_{a}^{b}x^{2}', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{ }^{ }',
    where: 'lower',
  });
  await mf.pressSequentially('a', { delay: 60 });
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{a}^{ }',
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
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{b}x^{2}');
});

test('ArrowLeft twice from the lower limit lands left of the integral', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('a', { delay: 60 });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  const info = await caretInfo(mf);
  expect(info.where).toBe('left');
});

test('ArrowRight from left of the integral enters the lower limit', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  // MQ binds Home/End to the current block; Ctrl+Home reaches the field start.
  await page.keyboard.press('Control+Home');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'left' });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{ }^{ }',
    where: 'lower',
  });
  await mf.pressSequentially('a', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{ }');
});

test('ArrowRight does not hijack in-limit movement', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('b', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('x', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{b}x');
  await page.keyboard.press('Control+Home');
  await settle(page);
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'lower' });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'lower' });
});

test('ArrowLeft traverses upper -> lower -> left of the integral', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('b', { delay: 60 });
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
  expect(await caretInfo(mf)).toMatchObject({ where: 'left' });
});

test('fast typing: inta with zero delay lands a in the lower limit', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int');
  await page.keyboard.press('Enter');
  await mf.pressSequentially('a');
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{ }');
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

test('Backspace right of a limits-bearing atom descends into it', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('a', { delay: 60 });
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
  // MQ descends into the last bound (upper) rather than deleting the atom.
  const info = await caretInfo(mf);
  expect(info.where).toBe('upper');
  expect(info.value).toBe('\\int_{a}^{b}');
});

test('Backspace at the start of the field hops over a bounds-carrying atom', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('b', { delay: 60 });
  await page.keyboard.press('Control+Home');
  await settle(page);
  await page.keyboard.press('Backspace');
  await settle(page);
  // Nothing to delete on the left: MQ selects the atom rather than
  // deleting past it. A second Backspace would remove it.
  const info = await caretInfo(mf);
  expect(info.value).toBe('\\int_{a}^{b}');
});

// Regression guard: this used to be pinned expected-fail when the
// editor's own selection handler fought the app's caret fix over the
// same selection. Under MathQuill there is one caret owner, so Tab just reaches the upper
// bound — runs as a normal test now.
test('Tab from the lower bound reaches the upper bound', async ({ page }) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('\\int', { delay: 60 });
  await page.keyboard.press('Enter');
  await mf.pressSequentially('a', { delay: 60 });
  await page.keyboard.press('Tab');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'upper' });
  await mf.pressSequentially('b', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{b}');
});

// Boundless integral signs for indefinite integrals: \iint renders the
// double sign ∬, \antid the single sign ∫ — neither carries blocks, so
// the integrand types linearly right of the sign and `_`/`^` grow an
// ordinary sibling SupSub on demand. `iint`/`antid` work via autoCommands
// (smart mode is on by default) and via the latex command input.
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

// A typed `/` scans left for numerator content — the scan must stop at a
// boundless integral sign the way it does at `\sum`/`\int`, otherwise the
// ∫ lands inside the fraction.
test('typed / after \\antid keeps the integral sign out of the fraction', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('antid', { delay: 60 });
  await mf.pressSequentially('x', { delay: 60 });
  await page.keyboard.press('/');
  const info = await caretInfo(mf);
  expect(info.value).toMatch(/^\\antid *\\frac\{x\}/);
  expect(info.value).not.toMatch(/frac\{[^}]*antid/);
  // DOM check: the .mq-int sign is not inside the numerator block.
  expect(
    await mf.evaluate((el) => el.querySelectorAll('.mq-numerator .mq-int').length),
  ).toBe(0);
  await mf.pressSequentially('y', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\antid\\frac{x}{y}');
});

test('typed / after \\iint_{a}^{b} leaves sign and bounds outside', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('iint', { delay: 60 });
  await mf.pressSequentially('_a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('^b', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('x', { delay: 60 });
  await page.keyboard.press('/');
  // The bound SupSub belongs to the integral — the numerator is just x.
  expect((await caretInfo(mf)).value).toBe('\\iint_{a}^{b}\\frac{x}{ }');
  expect(
    await mf.evaluate((el) => {
      const num = el.querySelector('.mq-numerator');
      return (
        (num?.querySelectorAll('.mq-int').length ?? 0) +
        (num?.querySelectorAll('.mq-supsub').length ?? 0)
      );
    }),
  ).toBe(0);
});

// `_`/`^` still produce a definite integral on the boundless signs: a
// sibling SupSub welds onto the atom (same tree `\iint_{a}^{b}` parses to).
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

// With smart mode's autoSubscriptNumerals a sub-only bound is
// arrow-skippable at baseline — after `\antid_{1}` ArrowRight lands to
// the RIGHT of the bound (same semantics as `x_1`), and the next letter
// types at baseline.
test('\\antid with a lone sub bound keeps baseline typing', async ({
  page,
}) => {
  const mf = page.locator('math-field').first();
  await mf.pressSequentially('antid', { delay: 60 });
  await mf.pressSequentially('_1', { delay: 60 });
  await settle(page);
  expect((await caretInfo(mf)).value).toBe('\\antid_{1}');
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('xdx', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\antid_{1}xdx');
});
