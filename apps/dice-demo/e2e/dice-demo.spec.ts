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

  await [
    { width: 320, height: 700 },
    { width: 768, height: 900 },
    { width: 1280, height: 900 },
  ].reduce(
    (previous, size) => previous.then(() => verifyResponsiveLayout(page, size)),
    Promise.resolve(),
  );

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

test('presents keep/drop and score results without hiding physical dice', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Classic throw ready');

  await page.locator('[data-notation="4d6kh3"]').click();
  await expect(page.locator('#status')).toHaveText('Roll settled');
  const keptDice = page.locator('#result span').last();
  await expect(keptDice).toContainText('(dropped)');
  await expect(keptDice).toHaveText(
    /^(?:d6: [1-6](?: \(dropped\))? · ){3}d6: [1-6](?: \(dropped\))?$/,
  );

  await page.locator('[data-notation="3d20s{1=-2,17..19=1,20=2}"]').click();
  await expect(page.locator('#status')).toHaveText('Roll settled');
  const scoredDice = page.locator('#result span').last();
  await expect(scoredDice).toHaveText(/→ (?:\+1|\+2|0|-2)/);
  const score = Number(await page.locator('#result strong').textContent());
  expect(score).toBeGreaterThanOrEqual(-6);
  expect(score).toBeLessThanOrEqual(6);
});

test('loads KTX2 skin variants and Web Audio sprite banks from dice-assets', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const status = page.locator('#status');
  await expect(status).toHaveText('Classic throw ready');

  await page.locator('[data-asset-skin="amethyst"][data-notation="d20"]').click();
  await expect(page.locator('#assets')).toHaveValue('amethyst');
  await expect(status).toHaveText('Roll settled');
  await testInfo.attach('amethyst-ktx2-d20.png', {
    body: await page.locator('#tray').screenshot(),
    contentType: 'image/png',
  });

  await page.locator('[data-asset-skin="emerald"][data-notation="2d6"]').click();
  await expect(page.locator('#assets')).toHaveValue('emerald');
  await expect(status).toHaveText('Roll settled');

  await page.locator('[data-audio="true"]').click();
  await expect(page.locator('#audio')).toBeChecked();
  await expect(page.locator('#audio-surface')).toHaveValue('wood-table');
  await expect(status).toHaveText('Roll settled');
});

async function verifyResponsiveLayout(
  page: Page,
  size: { readonly width: number; readonly height: number },
): Promise<void> {
  await page.setViewportSize(size);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  const selectors = ['#tray', '#roll-form', '.shortcuts', '.settings', '.asset-cases'] as const;
  const boundsBySelector = await Promise.all(
    selectors.map(async (selector) => ({
      bounds: await page.locator(selector).boundingBox(),
      selector,
    })),
  );
  for (const { bounds, selector } of boundsBySelector) {
    expect(bounds, `${selector} must be laid out at ${size.width}px`).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width);
  }
}

async function verifyRoll(page: Page, testInfo: TestInfo, rollCase: RollCase): Promise<void> {
  const result = page.locator('#result');
  const tray = page.locator('#tray');

  await page.locator(`.shortcuts [data-notation="${rollCase.notation}"]`).click();
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
