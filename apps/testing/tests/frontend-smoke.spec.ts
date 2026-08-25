import { expect, test, type ConsoleMessage } from '@playwright/test';

test('root page renders without application errors', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  const response = await page.goto('/');

  expect(response?.ok()).toBe(true);
  await expect(page.locator('main')).toBeAttached();
  expect(errors).toEqual([]);
});
