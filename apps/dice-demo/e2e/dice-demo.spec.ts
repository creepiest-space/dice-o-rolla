import { expect, test, type Page, type TestInfo } from '@playwright/test';

interface RollCase {
  readonly notation: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly components: RegExp;
}

const rollCases: readonly RollCase[] = [
  { notation: 'd4', minimum: 1, maximum: 4, components: /^d4: [1-4]$/ },
  { notation: 'd6', minimum: 1, maximum: 6, components: /^d6: [1-6]$/ },
  { notation: 'd8', minimum: 1, maximum: 8, components: /^d8: [1-8]$/ },
  { notation: 'd10', minimum: 1, maximum: 10, components: /^d10: (?:10|[1-9])$/ },
  { notation: 'd12', minimum: 1, maximum: 12, components: /^d12: (?:1[0-2]|[1-9])$/ },
  { notation: 'd20', minimum: 1, maximum: 20, components: /^d20: (?:1\d|20|[1-9])$/ },
  {
    notation: 'd%',
    minimum: 1,
    maximum: 100,
    components: /^d100: (?:[1-9]0|0) · d10: [0-9]$/,
  },
  {
    notation: 'd100',
    minimum: 1,
    maximum: 100,
    components: /^d100: (?:[1-9]0|0) · d10: [0-9]$/,
  },
  {
    notation: 'd66',
    minimum: 11,
    maximum: 66,
    components: /^d6: [1-6]0 · d6: [1-6]$/,
  },
];

test('rolls every supported die and exposes valid physical results', async ({ page }, testInfo) => {
  await page.goto('/');
  const status = page.locator('#status');
  const tray = page.locator('#tray');

  await expect(status).toHaveText('Classic throw ready');
  await expect(tray.locator('canvas')).toBeVisible();

  await rollCases.reduce(
    (previous, rollCase) => previous.then(() => verifyRoll(page, testInfo, rollCase)),
    Promise.resolve(),
  );
});

test('resizes, changes presentation settings, and clears safely', async ({ page }) => {
  await page.goto('/');
  const status = page.locator('#status');
  const canvas = page.locator('#tray canvas');

  await expect(status).toHaveText('Classic throw ready');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toBeVisible();
  const viewport = page.viewportSize();
  const canvasBounds = await canvas.boundingBox();
  expect(viewport).not.toBeNull();
  expect(canvasBounds).not.toBeNull();
  expect(canvasBounds!.width).toBeLessThanOrEqual(viewport!.width);

  await page.locator('#theme').selectOption('matte');
  await expect(page.locator('#theme')).toHaveValue('matte');
  await page.locator('#preset').selectOption('calm');
  await expect(status).toHaveText('Calm throw ready');

  await page.locator('[data-notation="d10"]').click();
  await expect(status).toHaveText('Roll settled');
  await page.locator('#clear').click();
  await expect(status).toHaveText('Tray cleared');
  await expect(page.locator('#result strong')).toHaveText('—');
});

async function verifyRoll(page: Page, testInfo: TestInfo, rollCase: RollCase): Promise<void> {
  const result = page.locator('#result');
  const tray = page.locator('#tray');

  await page.locator(`[data-notation="${rollCase.notation}"]`).click();
  await expect(result.locator('.result-label')).toHaveText(rollCase.notation);
  await expect(page.locator('#status')).toHaveText('Roll settled');

  const total = Number(await result.locator('strong').textContent());
  expect(Number.isInteger(total)).toBeTruthy();
  expect(total).toBeGreaterThanOrEqual(rollCase.minimum);
  expect(total).toBeLessThanOrEqual(rollCase.maximum);
  await expect(result.locator('span').last()).toHaveText(rollCase.components);

  if (rollCase.notation === 'd10' || rollCase.notation === 'd100') {
    await testInfo.attach(`${rollCase.notation}-settled.png`, {
      body: await tray.screenshot(),
      contentType: 'image/png',
    });
  }
}
