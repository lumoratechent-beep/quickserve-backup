import { test, expect, type Page } from '@playwright/test';

// Keep order entry checks isolated from the live restaurant and database.
const restaurant = {
  id: 'counter-test', name: 'Counter Test Cafe', vendor_id: 'owner',
  location_name: 'Test Hub', logo: '', is_online: true, categories: ['Food'],
  settings: { features: { dineInEnabled: true, takeawayEnabled: true, deliveryEnabled: true, tableManagementEnabled: true, savedBillEnabled: true, tableCount: 4 } },
};
const menu = [
  { id: 'rice', restaurant_id: restaurant.id, name: 'Test Rice', price: 10, category: 'Food', is_archived: false },
  { id: 'tea', restaurant_id: restaurant.id, name: 'Test Tea', price: 5, category: 'Food', is_archived: false, sizes: [{ name: 'Large', price: 7 }] },
  { id: 'open-price', restaurant_id: restaurant.id, name: 'Test Open Price', price: 0, category: 'Food', is_archived: false },
];

test.beforeEach(async ({ page }) => {
  await page.route('https://**.supabase.co/**', async route => {
    const table = new URL(route.request().url()).pathname.split('/').pop();
    const rows = table === 'restaurants' ? [restaurant] : table === 'menu_items' ? menu : [];
    const json = route.request().headers()['accept']?.includes('vnd.pgrst.object') ? (rows[0] || null) : rows;
    await route.fulfill({ json });
  });
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.addInitScript(() => {
    localStorage.setItem('qs_user', JSON.stringify({ id: 'cashier', username: 'Test Cashier', role: 'CASHIER', restaurantId: 'counter-test', isActive: true }));
    localStorage.setItem('qs_role', 'CASHIER');
    localStorage.setItem('qs_view', 'APP');
    localStorage.setItem('theme', 'light');
  });
});

const diningDialog = (page: Page) => page.getByRole('dialog', { name: 'Dining Option & Table' });
const menuItem = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(name) }).first();

for (const width of [1440, 390]) {
  test(`first item dining selection, cancellation and repeat entry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    if (width >= 1024) {
      await expect(page.getByRole('button', { name: 'Change table', exact: true })).toContainText('SELECT TABLE');
      await expect(page.getByRole('button', { name: 'Change dining option', exact: true })).toContainText('SELECT DINING OPTION');
    }
    await menuItem(page, 'Test Rice').click();
    const dialog = diningDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Dine-in', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: 'No Table No table assigned', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(dialog.getByRole('button', { name: 'Continue to Item' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    await menuItem(page, 'Test Rice').click();
    await dialog.getByRole('button', { name: 'Table 2 Available', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Takeaway', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Table 2 Available', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Table 2 Available', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`dining-popup-${width}.png`) });
    await dialog.getByRole('button', { name: 'Dine-in', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Continue to Item' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Table 2 Available', exact: true }).click();
    await dialog.getByRole('button', { name: 'Continue to Item' }).click();
    await expect(dialog).toBeHidden();
    await menuItem(page, 'Test Rice').click();
    await expect(dialog).toBeHidden();
    if (width < 1024) await page.getByRole('button', { name: /View Cart/i }).click();
    const tableControl = page.getByRole('button', { name: 'Change table', exact: true });
    await expect(tableControl).toBeVisible();
    await expect(tableControl).toContainText('Table 2');
    await tableControl.click();
    await dialog.getByRole('button', { name: 'Takeaway', exact: true }).click();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(tableControl).toBeVisible();
    await expect(tableControl).toContainText('Table 2');
    await tableControl.click();
    await expect(dialog.getByRole('button', { name: 'Dine-in', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Takeaway', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm Selection' }).click();
    await expect(page.getByRole('button', { name: 'Change dining option', exact: true })).toContainText('Takeaway');
    await expect(page.getByRole('button', { name: 'Change table', exact: true })).toContainText('-');
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`counter-takeaway-${width}.png`) });
  });
}

test('first item resumes modifiers after confirming dining selection', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await menuItem(page, 'Test Tea').click();
  const dialog = diningDialog(page);
  await dialog.getByRole('button', { name: 'Takeaway', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue to Item' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: /Large/i }).click();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change dining option' })).toContainText('Takeaway');
  await expect(page.getByText('Size: Large', { exact: false })).toBeVisible();
  await menuItem(page, 'Test Rice').click();
  await expect(dialog).toBeHidden();
});


test('new orders reset to dine-in and open-price items resume price entry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await menuItem(page, 'Test Rice').click();
  const dialog = diningDialog(page);
  await dialog.getByRole('button', { name: 'Takeaway', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue to Item' }).click();
  await page.getByRole('button', { name: 'Clear cart', exact: true }).click();
  await menuItem(page, 'Test Open Price').click();
  await expect(dialog.getByRole('button', { name: 'Dine-in', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Table 3 Available', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue to Item' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Enter price for this sale', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '8', exact: true }).click();
  await page.getByRole('button', { name: 'Add to Order', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change table' })).toContainText('Table 3');
  await expect(page.getByRole('button', { name: 'Actions for Test Open Price' })).toBeVisible();
});

test('delivery disables tables and Escape discards draft changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await menuItem(page, 'Test Rice').click();
  const dialog = diningDialog(page);
  await dialog.getByRole('button', { name: 'Delivery', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Table 1 Available', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Cart is empty', { exact: true })).toBeVisible();
  await menuItem(page, 'Test Rice').click();
  await expect(dialog.getByRole('button', { name: 'Dine-in', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'No Table No table assigned', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue to Item' }).click();
  await expect(page.getByRole('button', { name: 'Change table' })).toContainText('-');
});


for (const viewport of [{ width: 320, height: 640 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
  test(`order setup stays usable with many tables at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('https://**.supabase.co/rest/v1/restaurants?*', route => route.fulfill({ json: [{
      ...restaurant, settings: { features: { ...restaurant.settings.features, tableCount: 30 } },
    }] }));
    await page.goto('/');
    await menuItem(page, 'Test Rice').click();
    const dialog = diningDialog(page);
    await expect(dialog).toBeVisible();
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    const primary = dialog.getByRole('button', { name: 'Continue to Item' });
    await expect(primary).toBeInViewport();
    const target = dialog.getByRole('button', { name: 'Table 30 Available', exact: true });
    await target.scrollIntoViewIfNeeded();
    await target.click();
    const tile = (await target.boundingBox())!;
    expect(tile.width).toBeGreaterThanOrEqual(44);
    expect(tile.height).toBeGreaterThanOrEqual(44);
    await expect(primary).toBeInViewport();
    await expect(dialog.locator('footer')).toContainText('Table 30');
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('many-tables.png') });
    await primary.click();
    await expect(dialog).toBeHidden();
  });
}

test('dark order setup has a visible selection and traps keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.goto('/');
  await menuItem(page, 'Test Rice').click();
  const dialog = diningDialog(page);
  const primary = dialog.getByRole('button', { name: 'Continue to Item' });
  await primary.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close dining and table selection' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(primary).toBeFocused();
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('dark-order-setup.png') });
});


for (const width of [1440, 1044, 390]) {
  test(`saving shows animated feedback and keeps counter ready at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let savedBill: Record<string, any> | null = null;
    let finishSave!: () => void;
    const saveResponse = new Promise<void>(resolve => { finishSave = resolve; });
    await page.route('https://**.supabase.co/rest/v1/saved_bills**', async route => {
      if (route.request().method() === 'POST') {
        savedBill = route.request().postDataJSON();
        await saveResponse;
      }
      await route.fulfill({ json: [] });
    });
    await page.goto('/');
    await menuItem(page, 'Test Rice').click();
    const dialog = diningDialog(page);
    await dialog.getByRole('button', { name: 'Table 2 Available', exact: true }).click();
    await dialog.getByRole('button', { name: 'Continue to Item' }).click();
    if (width < 1024) await page.getByRole('button', { name: 'View cart', exact: true }).click();
    await page.getByRole('button', { name: 'Save Bill', exact: true }).click();
    const saving = page.getByRole('status', { name: 'Saving table bill' });
    await expect(saving).toBeVisible();
    await expect(saving).toHaveAttribute('aria-busy', 'true');
    await expect(saving.locator('.table-bill-saving-receipt')).toHaveCSS('animation-name', 'tableBillReceiptFloat');
    finishSave();
    await expect(saving).toBeHidden();
    const notification = page.getByRole('status').filter({ hasText: 'Order saved to Table 2' });
    await expect(notification).toBeVisible();
    const subtitle = notification.getByText('Ready for the next order.', { exact: true });
    expect(await subtitle.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    })).toBe(1);
    expect(savedBill).toMatchObject({ restaurant_id: 'counter-test', table_number: 'Table 2', dining_type: 'Dine-in' });
    expect(savedBill!.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'rice', quantity: 1 })]));
    await expect(page.getByRole('heading', { name: 'Table Bills', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'View cart', exact: true })).toBeHidden();
    await expect(notification).toHaveCSS('animation-name', 'tableBillSuccessEnter');
    await expect(notification.locator('.table-bill-check-stroke')).toHaveCSS('animation-name', 'tableBillCheckDraw');
    await expect(notification.locator('.table-bill-success-countdown')).toHaveCSS('animation-duration', '4.2s');
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('table-bill-saved.png') });
    const bounds = (await notification.boundingBox())!;
    expect(bounds.height).toBeLessThanOrEqual(90);
    expect(bounds.width).toBeLessThanOrEqual(360);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y).toBeCloseTo(16, 0);
    expect(bounds.x + bounds.width / 2).toBeCloseTo(width / 2, 0);
    await menuItem(page, 'Test Rice').click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Dine-in', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: 'Table 2 Has pending bill', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    if (width >= 1024) {
      await page.getByRole('button', { name: /^TABLE BILL/i }).click();
      await expect(page.getByRole('heading', { name: 'Table Bills', exact: true })).toBeVisible();
      await page.getByRole('button', { name: /^Table 2 /i }).click();
      await expect(page.getByText('Test Rice', { exact: true })).toBeVisible();
    }
  });
}

test('a failed table bill save retains the draft and allows retry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let attempts = 0;
  await page.route('https://**.supabase.co/rest/v1/saved_bills**', async route => {
    if (route.request().method() !== 'POST') { await route.fulfill({ json: [] }); return; }
    attempts++;
    if (attempts === 1) await route.fulfill({ status: 400, json: { message: 'Test save failure', code: 'TEST_FAILURE' } });
    else await route.fulfill({ json: [] });
  });
  await page.goto('/');
  await menuItem(page, 'Test Rice').click();
  const dialog = diningDialog(page);
  await dialog.getByRole('button', { name: 'Table 1 Available', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue to Item' }).click();
  await page.getByRole('button', { name: 'Save Bill', exact: true }).click();
  await expect(page.getByText('Could not save table bill. Your order is still here. Please try again.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions for Test Rice', exact: true })).toBeVisible();
  await expect(page.getByText('Order saved to Table 1', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save Bill', exact: true }).click();
  await expect(page.getByText('Order saved to Table 1', { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});


for (const width of [1440, 390]) {
  test(`dining changes animate Save Bill away and expand payment at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await menuItem(page, 'Test Rice').click();
    const dialog = diningDialog(page);
    await dialog.getByRole('button', { name: 'Table 1 Available', exact: true }).click();
    await dialog.getByRole('button', { name: 'Continue to Item' }).click();
    if (width < 1024) await page.getByRole('button', { name: 'View cart', exact: true }).click();
    const actions = page.locator('.counter-checkout-actions:visible');
    const save = actions.getByRole('button', { name: 'Save Bill', exact: true });
    const pay = actions.getByRole('button', { name: width >= 1024 ? 'Complete Payment' : /Pay RM/ });
    await expect(save).toBeVisible();
    expect(await actions.evaluate(element => getComputedStyle(element).transitionProperty)).toContain('grid-template-columns');
    const initialWidth = (await pay.boundingBox())!.width;
    for (const dining of ['Takeaway', 'Delivery']) {
      await page.getByRole('button', { name: 'Change dining option', exact: true }).click();
      await dialog.getByRole('button', { name: dining, exact: true }).click();
      await dialog.getByRole('button', { name: 'Confirm Selection', exact: true }).click();
      await expect(save).toHaveCount(0);
      await expect.poll(async () => (await pay.boundingBox())!.width).toBeGreaterThan(initialWidth * 1.8);
      await expect(pay).toBeEnabled();
    }
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('takeaway-full-payment.png') });
    await page.getByRole('button', { name: 'Change dining option', exact: true }).click();
    await dialog.getByRole('button', { name: 'Dine-in', exact: true }).click();
    await dialog.getByRole('button', { name: 'Table 1 Available', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm Selection', exact: true }).click();
    await expect(save).toBeVisible();
    await expect.poll(async () => (await pay.boundingBox())!.width).toBeLessThan(initialWidth * 1.1);
  });
}

test('tables with existing bills are disabled when starting a new order', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://**.supabase.co/rest/v1/saved_bills**', route => route.fulfill({ json: [{
    id: 'existing-bill', restaurant_id: 'counter-test', table_number: 'Table 1',
    dining_type: 'Dine-in', items: [], created_at: new Date().toISOString(),
  }] }));
  await page.goto('/');
  await menuItem(page, 'Test Rice').click();
  const dialog = diningDialog(page);
  const occupied = dialog.getByRole('button', { name: 'Table 1 Has pending bill', exact: true });
  await expect(occupied).toBeDisabled();
  await expect(occupied).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.getByRole('button', { name: 'Table 2 Available', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Table 2 Available', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue to Item', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change table' })).toContainText('Table 2');
});


test('Table Bill shows the last table without a blank footer strip', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 748 });
  const largeRestaurant = { ...restaurant, settings: { features: { ...restaurant.settings.features, tableCount: 40 } } };
  await page.route('https://**.supabase.co/rest/v1/restaurants?*', route => route.fulfill({
    json: route.request().headers()['accept']?.includes('vnd.pgrst.object') ? largeRestaurant : [largeRestaurant],
  }));
  await page.goto('/');
  await page.getByRole('button', { name: /^TABLE BILL/i }).click();
  const scroll = page.locator('.saved-bill-table-panel-scroll:visible');
  const lastTable = scroll.getByRole('button', { name: /^Table 40 /i });
  await lastTable.scrollIntoViewIfNeeded();
  await expect(lastTable).toBeInViewport({ ratio: 1 });
  const scrollBounds = (await scroll.boundingBox())!;
  const lastBounds = (await lastTable.boundingBox())!;
  expect(lastBounds.y + lastBounds.height).toBeLessThanOrEqual(scrollBounds.y + scrollBounds.height);
  const footer = page.locator('[data-table-bill-footer]');
  await expect(footer).toBeInViewport({ ratio: 1 });
  expect((await footer.boundingBox())!.height).toBeLessThan(145);
  expect(await scroll.evaluate(element => element.parentElement!.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(1);
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('compact-table-bill.png') });
});


for (const width of [1920, 1100, 390]) {
  test(`QR order controls fit without horizontal scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const qrRestaurant = { ...restaurant, settings: { features: { ...restaurant.settings.features, qrEnabled: true } } };
    await page.route('https://**.supabase.co/rest/v1/restaurants?*', route => route.fulfill({
      json: route.request().headers()['accept']?.includes('vnd.pgrst.object') ? qrRestaurant : [qrRestaurant],
    }));
    await page.route('https://**.supabase.co/rest/v1/subscriptions?*', route => route.fulfill({ json: [{
      id: 'pro', restaurant_id: 'counter-test', plan_id: 'pro', status: 'active', current_period_end: '2027-12-31T00:00:00Z',
    }] }));
    await page.goto('/');
    if (width < 1024) await page.getByRole('button', { name: 'Open POS menu' }).click();
    await page.getByRole('button', { name: 'QR & Table Order', exact: true }).click();
    if (width < 1536) await expect(page.getByText('Manage orders placed via QR table scan.', { exact: true })).toBeHidden();
    else await expect(page.getByText('Manage orders placed via QR table scan.', { exact: true })).toBeVisible();
    const group = page.getByRole('group', { name: 'QR order status' });
    await expect(group).toBeVisible();
    const info = page.getByRole('button', { name: 'Kitchen routing information' });
    await info.hover();
    const tooltip = page.getByRole('note');
    await expect(tooltip).toBeHidden();
    await info.click();
    await expect(tooltip).toBeVisible();
    await page.mouse.move(width - 1, 500);
    await expect(tooltip).toBeVisible();
    const infoBounds = (await info.boundingBox())!;
    const tooltipBounds = (await tooltip.boundingBox())!;
    expect(tooltipBounds.x).toBeGreaterThanOrEqual(infoBounds.x - 1);
    expect(tooltipBounds.x + tooltipBounds.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    const box = (await group.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await group.getByRole('button', { name: 'All', exact: true }).click();
    await expect(group.getByRole('button', { name: 'All', exact: true })).toHaveClass(/bg-orange-500/);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('qr-order-controls.png') });
  });
}

for (const width of [820, 1100]) {
test(`QR generator controls fit the tablet layout at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  const qrRestaurant = { ...restaurant, settings: { features: { ...restaurant.settings.features, qrEnabled: true } } };
  await page.route('https://**.supabase.co/rest/v1/restaurants?*', route => route.fulfill({
    json: route.request().headers()['accept']?.includes('vnd.pgrst.object') ? qrRestaurant : [qrRestaurant],
  }));
  await page.route('https://**.supabase.co/rest/v1/subscriptions?*', route => route.fulfill({ json: [{
    id: 'pro', restaurant_id: 'counter-test', plan_id: 'pro', status: 'active', current_period_end: '2027-12-31T00:00:00Z',
  }] }));
  await page.goto('/');
  if (width < 1024) await page.getByRole('button', { name: 'Open POS menu' }).click();
  await page.getByRole('button', { name: 'QR & Table Order', exact: true }).click();
  await page.getByRole('button', { name: 'QR Generator', exact: true }).click();

  const location = page.getByText('Location Name', { exact: true }).locator('..');
  const prefix = page.getByText('Table Prefix', { exact: true }).locator('..');
  const locationBox = (await location.boundingBox())!;
  const prefixBox = (await prefix.boundingBox())!;
  expect(prefixBox.y).toBeGreaterThan(locationBox.y + locationBox.height - 1);

  await expect(page.getByRole('button', { name: 'Decrease number of tables' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Increase number of tables' })).toBeHidden();
  await expect(page.getByText('Number of Tables', { exact: true }).locator('..').locator('input')).toBeVisible();
  expect(await page.getByRole('button', { name: 'Print All', exact: true }).innerText()).toBe('PRINT ALL');
  expect(await page.getByRole('button', { name: 'Reset QR generator' }).innerText()).toBe('RESET ALL');
  await expect(page.getByRole('button', { name: 'Preview & Download', exact: true })).toBeVisible();
  await expect(page.locator('span:visible').filter({ hasText: /^Table \d+ of 10$/ })).toBeVisible();
  await expect(page.getByTitle(/^Download QR for /).first()).toBeHidden();
});
}

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`counter placeholders fit without wrapping or overlapping arrows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    if (width < 1024) {
      await menuItem(page, 'Test Rice').click();
      await diningDialog(page).getByRole('button', { name: 'Takeaway', exact: true }).click();
      await diningDialog(page).getByRole('button', { name: 'Continue to Item' }).click();
      await page.getByRole('button', { name: /View Cart/i }).click();
      await page.getByRole('button', { name: 'Clear cart', exact: true }).last().click();
    }
    for (const [name, text] of [['Change table', 'SELECT TABLE'], ['Change dining option', 'SELECT DINING OPTION']]) {
      const control = page.getByRole('button', { name, exact: true });
      await expect(control).toBeVisible();
      const label = control.getByText(text, { exact: true });
      const labelBox = (await label.boundingBox())!;
      const arrowBox = (await control.locator('svg').boundingBox())!;
      const controlBox = (await control.boundingBox())!;
      expect(labelBox.x + labelBox.width + 4).toBeLessThanOrEqual(arrowBox.x);
      expect(controlBox.x).toBeGreaterThanOrEqual(0);
      expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(width);
      expect(await label.evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      })).toBe(1);
      expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`counter-placeholder-width-${width}.png`) });
  });
}

test('save bill feedback respects reduced motion and can be dismissed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await menuItem(page, 'Test Rice').click();
  const dialog = diningDialog(page);
  await dialog.getByRole('button', { name: 'Table 1 Available', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue to Item' }).click();
  await page.getByRole('button', { name: 'Save Bill', exact: true }).click();
  const notification = page.getByRole('status').filter({ hasText: 'Order saved to Table 1' });
  await expect(notification).toBeVisible();
  await expect(notification).toHaveCSS('animation-name', 'none');
  await expect(notification.locator('.table-bill-check-stroke')).toHaveCSS('animation-name', 'none');
  await expect(notification.locator('.table-bill-spark').first()).toBeHidden();
  await notification.getByRole('button', { name: 'Dismiss table bill notification' }).click();
  await expect(notification).toBeHidden();
});

for (const width of [320, 390, 768, 1044, 1440]) {
  test(`original menu editor tabs fit or scroll without clipping at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    if (width < 1024) await page.getByRole('button', { name: 'Open POS menu' }).click();
    await page.getByRole('button', { name: 'Menu Editor', exact: true }).click();
    const sections = page.getByRole('navigation', { name: 'Menu editor sections' });
    await expect(sections).toBeVisible();
    const bounds = (await sections.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    if (width >= 768) expect(await sections.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(bounds.height).toBeLessThanOrEqual(52);
    for (const name of ['Kitchen Menu', 'Category', 'Modifier', 'Add-On Item', 'Promotion']) {
      const tab = sections.getByRole('button', { name, exact: true });
      await tab.scrollIntoViewIfNeeded();
      await expect(tab).toBeInViewport({ ratio: 0.99 });
      const box = (await tab.boundingBox())!;
      expect(box.width).toBeLessThan(160);
      expect(box.x).toBeGreaterThanOrEqual(bounds.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      expect(await tab.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await tab.click();
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
    }
    await sections.getByRole('button', { name: 'Kitchen Menu', exact: true }).click();
    await sections.evaluate(element => { element.scrollLeft = 0; });
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`menu-editor-tabs-${width}.png`) });
  });
}
