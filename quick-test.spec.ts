import { test, expect } from '@playwright/test';

test('homepage loads successfully', async ({ page }) => {
  await page.goto('http://localhost:8084');
  await expect(page).toHaveTitle(/Des Moines|Insider/i);
  console.log('✅ Homepage loaded successfully!');
});

test('no horizontal scroll on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('http://localhost:8084');
  
  const hasHorizontalScroll = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  
  expect(hasHorizontalScroll).toBe(false);
  console.log('✅ No horizontal scroll on mobile!');
});
