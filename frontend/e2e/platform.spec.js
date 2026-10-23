import { expect, test } from '@playwright/test';

test('control room: login, dashboard and optimiser preview', async ({ page }) => {
  await page.goto('/login');
  await page.getByText('Control room').click();
  await expect(page.getByText('Active incidents', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Run optimiser/ }).click();
  await expect(page.getByText('Resource Optimisation Engine')).toBeVisible();
  await expect(page.getByText(/Avg ETA \(optimal\)/)).toBeVisible();
});

test('SMS gateway: a 2G SMS becomes an AI-triaged incident with an SMS reply', async ({ page }) => {
  await page.goto('/login');
  await page.getByText('Control room').click();
  await page.goto('/gateway');
  await page.getByPlaceholder('Type SMS…').fill('SOS Adyar 9 people trapped on terrace water rising');
  await page.locator('form button.btn-primary').first().click();
  await expect(page.getByText(/SOS received \(ref #\d+\)/).first()).toBeVisible({ timeout: 15000 });
});

test('citizen SOS works without login', async ({ page }) => {
  await page.goto('/sos');
  await page.locator('textarea').fill('URGENT 8 people trapped on rooftop in Velachery water rising');
  await page.getByRole('button', { name: /SEND SOS/ }).click();
  await expect(page.getByText('SOS received')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/urgency/i).first()).toBeVisible();
});

test('field app queues updates with no signal and syncs after', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByText('Field responder').click();
  await expect(page.getByText(/Connected to control room|No signal/)).toBeVisible();
  await page.getByRole('button', { name: 'Simulate no signal' }).click();
  await page.getByPlaceholder(/12 more people/).fill('Two more families stranded behind the school');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/1 queued/)).toBeVisible();
  await page.getByRole('button', { name: 'Restore signal' }).click();
  await expect(page.getByText(/queued/)).toHaveCount(0, { timeout: 15000 });
});

test('voice SOS: a spoken emergency is transcribed offline and sent', async ({ page, context }) => {
  // the laptop's Wi-Fi is off: the browser reports offline, the local server still works
  await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false }));
  await page.goto('/sos');
  await page.getByRole('button', { name: 'Speak your emergency' }).click();
  await page.waitForTimeout(8000);
  await page.getByRole('button', { name: /Stop/ }).click();
  await expect(page.getByText('SOS received')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/trapped/i).first()).toBeVisible();
  await expect(page.getByText(/urgency/i).first()).toBeVisible();
});
