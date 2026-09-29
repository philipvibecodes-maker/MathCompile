import { expect, test } from '@playwright/test';
import { caretInfo } from './helpers';

// Limits traversal contract. MathQuill's SupSub traverses in written order
// (lower bound then upper bound), which is exactly the behavior the old
// MathLive limitNavigation.ts shim hand-built — that module is gone.
//
// Differences vs the MathLive suite:
// - caretInfo reads the rendered .mq-cursor element, not model.position;
//   `leftText` (rendered text left of the caret) replaces the position
//   index. MQ's DOM order puts .mq-sup before .mq-sub, so '∫ba' means
//   "caret after a in the lower bound of \int_{a}^{b}".
// - MQ has no placeholder atoms: empty bounds serialize `{ }`.
// - MQ Home/End are block-local; Ctrl-Home/Ctrl-End hit the field edges.
// - MQ serializes exponents braced: x^{2} not x^2.

const cell = (page: import('@playwright/test').Page) =>
  page.locator('math-field').first();

const settle = (page: import('@playwright/test').Page) =>
  page.waitForTimeout(60);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const mf = cell(page);
  await mf.click();
  await mf.focus();
});

test('int a Right b Right x^2 produces \\int_{a}^{b}x^{2} with rendered caret tracking', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('int', { delay: 60 });
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

test('ArrowLeft twice from lower limit lands left of the integral', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('inta', { delay: 60 });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  const info = await caretInfo(mf);
  expect(info.where).toBe('left');
  expect(info.leftText).toBe('');
});

test('ArrowRight from left of the integral enters the lower limit', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('int', { delay: 60 });
  await page.keyboard.press('Control+Home'); // MQ Home is block-local
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ leftText: '', where: 'left' });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{ }^{ }',
    where: 'lower',
  });
  await mf.pressSequentially('a', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{ }');
});

test('ArrowRight from left of the integral does not hijack in-limit movement', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('int', { delay: 60 });
  await mf.pressSequentially('a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('b', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('x', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{b}x');
  await page.keyboard.press('Control+Home');
  await settle(page);
  expect((await caretInfo(mf)).leftText).toBe('');
  await page.keyboard.press('ArrowRight');
  await settle(page);
  // MQ DOM order is ∫, sup(b), sub(a): caret before 'a' reads '∫b'.
  expect(await caretInfo(mf)).toMatchObject({
    leftText: '∫b',
    where: 'lower',
  });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    leftText: '∫ba',
    where: 'lower',
  });
});

test('ArrowLeft traverses upper -> lower -> left of the integral', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('inta', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('b', { delay: 60 });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  // Caret before 'b', start of the upper limit.
  expect(await caretInfo(mf)).toMatchObject({ leftText: '∫', where: 'upper' });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    leftText: '∫ba',
    where: 'lower',
  });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    leftText: '∫b',
    where: 'lower',
  });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ leftText: '', where: 'left' });
});

test('ArrowLeft from the empty upper bound goes to the lower limit', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('int', { delay: 60 });
  await mf.pressSequentially('a', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'upper' });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\int_{a}^{ }',
    leftText: '∫a',
    where: 'lower',
  });
});

test('fast typing: inta with zero delay lands a in the lower limit', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('inta');
  expect((await caretInfo(mf)).value).toBe('\\int_{a}^{ }');
});

test('ArrowLeft on a plain expression moves one atom', async ({ page }) => {
  const mf = cell(page);
  await mf.pressSequentially('x+y', { delay: 60 });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  // One atom back: caret sits between '+' and 'y'.
  expect((await caretInfo(mf)).leftText).toBe('x+');
});

test('sum template: multi-atom lower bound then upper', async ({ page }) => {
  const mf = cell(page);
  await mf.pressSequentially('sum', { delay: 60 });
  await settle(page);
  // \sum renders limits over/under (.mq-to/.mq-from): the caret sits in the
  // lower bound — MathQuill doesn't use placeholder atoms or selections.
  expect(await caretInfo(mf)).toMatchObject({
    value: '\\sum_{ }^{ }',
    collapsed: true,
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

test('Backspace right of a limits-bearing atom lands in the upper limit', async ({
  page,
}) => {
  const mf = cell(page);
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
  // Nothing deleted — the caret descends into the last bound (the upper
  // one). Same semantics limitNavigation.ts hand-built for MathLive.
  const info = await caretInfo(mf);
  expect(info.where).toBe('upper');
  expect(info.value).toBe('\\int_{a}^{b}');
});

test('Backspace at the start of the field does nothing', async ({ page }) => {
  const mf = cell(page);
  await mf.pressSequentially('inta', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('b', { delay: 60 });
  await page.keyboard.press('Control+Home');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({
    leftText: '',
    where: 'left',
  });
  await page.keyboard.press('Backspace');
  await settle(page);
  const info = await caretInfo(mf);
  expect(info.value).toBe('\\int_{a}^{b}');
  expect(info.where).toBe('left');
});

test('Backspace at the start of a bound unwraps the operator', async ({
  page,
}) => {
  const mf = cell(page);
  await mf.pressSequentially('inta', { delay: 60 });
  await page.keyboard.press('ArrowRight');
  await mf.pressSequentially('b', { delay: 60 });
  // Home is block-local in MQ: lands at the start of the upper bound.
  await page.keyboard.press('Home');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'upper' });
  await page.keyboard.press('Backspace');
  await settle(page);
  // MQ's deleteOutOf drops the \int wrapper and spills the bound contents.
  const info = await caretInfo(mf);
  expect(info.value).toBe('ab');
});

test('Tab advances the caret lower -> upper', async ({ page }) => {
  const mf = cell(page);
  await mf.pressSequentially('int', { delay: 60 });
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'lower' });
  await page.keyboard.press('Tab');
  await settle(page);
  expect(await caretInfo(mf)).toMatchObject({ where: 'upper' });
  await mf.pressSequentially('a', { delay: 60 });
  expect((await caretInfo(mf)).value).toBe('\\int_{ }^{a}');
});
