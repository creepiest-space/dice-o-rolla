import { expect, test } from '@playwright/test';

test('inspects connected nets at fixed face views and releases the viewer on close', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Classic throw ready');
  await page.locator('#texture-inspector summary').click();
  const canvas = page.locator('#inspect-canvas canvas');
  const image = page.locator('#inspect-net');
  await ['d6', 'd4', 'd8', 'd10', 'd12', 'd20', 'd100', 'd66'].reduce(async (previous, type) => {
    await previous;
    await page.locator('#inspect-type').selectOption(type);
    await expect(page.locator('#inspect-status')).toHaveText(`${type} texture ready`);
    await expect(image).toHaveJSProperty('complete', true);
    await expect(image).toHaveJSProperty('naturalWidth', 2048);
    await page.locator('#inspect-face').selectOption('1');
    await expect(page.locator('#inspect-canvas')).toHaveAttribute('data-face', '1');
    await expect(canvas).toHaveScreenshot(`${type}-face-1.png`, { maxDiffPixelRatio: 0.02 });
  }, Promise.resolve());
  await page.locator('#inspect-type').selectOption('d6');
  await expect(page.locator('#inspect-status')).toHaveText('d6 texture ready');
  await ['2', '3', '4', '5', '6'].reduce(async (previous, value) => {
    await previous;
    await page.locator('#inspect-face').selectOption(value);
    await expect(canvas).toHaveScreenshot(`d6-face-${value}.png`, { maxDiffPixelRatio: 0.02 });
  }, Promise.resolve());
  await page.locator('#inspect-previous').click();
  await expect(page.locator('#inspect-face')).toHaveValue('5');
  await page.locator('#inspect-next').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#inspect-face')).toHaveValue('6');
  const front = await canvas.screenshot();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + bounds.height / 2 + 30, {
    steps: 6,
  });
  await page.mouse.up();
  expect(await canvas.screenshot()).not.toEqual(front);
  await page.locator('#inspect-reset').click();
  await expect(page.locator('#inspect-canvas')).toHaveAttribute('data-face', 'overview');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toBeVisible();
  expect((await canvas.boundingBox())!.width).toBeLessThanOrEqual(390);
  await page.locator('#texture-inspector summary').click();
  await expect(canvas).toHaveCount(0);
  await page.locator('#texture-inspector summary').click();
  await expect(page.locator('#inspect-status')).toHaveText('d6 texture ready');
  await expect(canvas).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('rolls a diagnostic cube and skin set, then restores classic skins', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Classic throw ready');
  await page.getByRole('button', { name: 'Diagnostic d6', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Roll settled');
  await expect(page.locator('#result')).toContainText(/d6: [1-6]/);
  await page.getByRole('button', { name: 'Diagnostic set', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Roll settled');
  await Promise.all(
    ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map((type) =>
      expect(page.locator('#result')).toContainText(`${type}:`),
    ),
  );
  await page.locator('[data-notation="d66"]').click();
  await expect(page.locator('#status')).toHaveText('Roll settled');
  await expect(page.locator('#result')).toContainText(/d6: [1-6]0 · d6: [1-6]/);
  await page.locator('#assets').selectOption('classic');
  await page.locator('[data-notation="d4"]').click();
  await expect(page.locator('#status')).toHaveText('Roll settled');
  expect(errors).toEqual([]);
});

test('recovers from a failed texture and closing the inspector during loading', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Classic throw ready');
  await page.locator('#texture-inspector summary').click();
  await expect(page.locator('#inspect-status')).toHaveText('d6 texture ready');
  await page.route('**/diagnostic-d12.ktx2', (route) => route.abort());
  await page.locator('#inspect-type').selectOption('d12');
  await expect(page.locator('#inspect-status')).toContainText('diagnostic-d12.ktx2');
  await expect(page.locator('#inspect-face')).toBeDisabled();
  await page.unroute('**/diagnostic-d12.ktx2');
  await page.locator('#inspect-type').selectOption('d6');
  await expect(page.locator('#inspect-status')).toHaveText('d6 texture ready');
  await page.locator('#inspect-type').selectOption('d12');
  await expect(page.locator('#inspect-status')).toHaveText('d12 texture ready');
  await page.locator('#texture-inspector summary').click();
  await expect(page.locator('#inspect-canvas canvas')).toHaveCount(0);
  // Closing immediately after a new selection must not append a late mesh/canvas.
  await page.locator('#texture-inspector summary').click();
  await page.locator('#texture-inspector summary').click();
  await expect(page.locator('#inspect-canvas canvas')).toHaveCount(0);
  await page.locator('#texture-inspector summary').click();
  await expect(page.locator('#inspect-status')).toHaveText('d12 texture ready');
  await expect(page.locator('#inspect-canvas canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});
