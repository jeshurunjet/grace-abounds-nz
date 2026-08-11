import { expect, test } from '@playwright/test';

test('shows the project placeholder', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Grace Abounds NZ' }),
  ).toBeVisible();
});
