import { test, expect } from '@playwright/test';

const users = [
  { id: 'admin', username: 'admin', role: 'ADMIN', is_active: true },
  { id: 'owner', username: 'cafe-owner', role: 'VENDOR', restaurant_id: 'cafe', is_active: true, email: 'owner@example.test' },
  { id: 'cashier', username: 'cafe-cashier', role: 'CASHIER', restaurant_id: 'cafe', is_active: true },
  { id: 'kitchen', username: 'cafe-kitchen', role: 'KITCHEN', restaurant_id: 'cafe', is_active: false },
  { id: 'baker', username: 'bakery-owner', role: 'VENDOR', restaurant_id: 'bakery', is_active: true },
];
const restaurants = [
  { id: 'cafe', name: 'Corner Cafe', vendor_id: 'owner', location_name: 'Main Hub', menu: [], logo: '', is_online: true },
  { id: 'bakery', name: 'Bakery', vendor_id: 'baker', location_name: 'Main Hub', menu: [], logo: '', is_online: false },
];

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => console.error('Browser error:', error.message));
  // Keep browser runs deterministic and prevent access to the live database.
  await page.route('https://**.supabase.co/**', async route => {
    const table = new URL(route.request().url()).pathname.split('/').pop();
    const body = table === 'users' ? users : table === 'restaurants' ? restaurants
      : table === 'areas' ? [{ id: 'hub', name: 'Main Hub', code: 'MAIN', state: 'Selangor', city: 'Shah Alam', is_active: true }]
      : table === 'subscriptions' ? [{ id: 'subscription', restaurant_id: 'cafe', plan_id: 'pro', status: 'active', current_period_end: '2027-12-31T00:00:00Z' }]
      : [];
    await route.fulfill({ json: body });
  });
  await page.route('**/api/**', route => route.fulfill({ json: {
    revenue: 0, completedOrders: 0, totalOrders: 0, averageOrder: 0, completionRate: 0,
    dailySales: [], vendors: [], payments: [], statusBreakdown: [], topItems: [],
    orders: [], totalCount: 0, totalRevenue: 0, orderVolume: 0, efficiency: 0,
    transactions: [], summary: { totalGross: 0, totalFees: 0, totalNet: 0, count: 0, totalRevenue: 0, orderVolume: 0, efficiency: 0 }, hasMore: false,
  } }));
  await page.addInitScript(() => {
    localStorage.setItem('qs_user', JSON.stringify({ id: 'admin', username: 'admin', role: 'ADMIN', isActive: true }));
    localStorage.setItem('qs_role', 'ADMIN');
    localStorage.setItem('qs_view', 'APP');
    localStorage.setItem('qs_cache_restaurants', '[]');
    localStorage.setItem('qs_cache_locations', '[]');
    localStorage.setItem('theme', 'light');
  });
});

async function openUsers(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'User Management', exact: true })).toBeAttached();
  const menuButton = page.getByRole('button', { name: 'Open admin menu', exact: true });
  if (await menuButton.isVisible()) await menuButton.click();
  await page.getByRole('button', { name: 'User Management', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'cafe-cashier @cafe-cashier', exact: true })).toBeVisible();
}

for (const width of [768, 1024, 1253, 1440]) {
  test(`compact user table and one-line toolbar at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openUsers(page);
    const header = page.locator('header').filter({ has: page.getByRole('img', { name: 'QuickServe', exact: true }) });
    await expect(header).toHaveCount(1);
    const menu = page.getByRole('button', { name: 'Open admin menu', exact: true });
    if (width < 1024) {
      await expect(header.getByRole('button', { name: 'Open admin menu', exact: true })).toBeVisible();
      const menuBox = (await menu.boundingBox())!;
      const logoBox = (await header.getByRole('img', { name: 'QuickServe', exact: true }).boundingBox())!;
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(logoBox.x);
      expect(Math.abs(menuBox.y + menuBox.height / 2 - logoBox.y - logoBox.height / 2)).toBeLessThan(2);
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await menu.click();
      await expect(menu).toHaveAttribute('aria-expanded', 'true');
      await page.getByRole('button', { name: 'User Management', exact: true }).click();
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
    } else await expect(menu).toBeHidden();
    await expect(page.getByRole('heading', { name: 'User Management', exact: true })).toHaveCount(1);
    const search = page.getByRole('textbox', { name: 'Search users or vendors' });
    const controls = [search, page.getByLabel('Filter by access type'), page.getByLabel('Filter by status'), page.getByLabel('Users per page')];
    const boxes = await Promise.all(controls.map(control => control.boundingBox()));
    for (const box of boxes) {
      expect(box).not.toBeNull();
      expect(Math.abs(box!.y - boxes[0]!.y)).toBeLessThanOrEqual(1);
      expect(box!.height).toBeLessThanOrEqual(36);
    }
    expect(boxes[0]!.width).toBeGreaterThan(150);
    await expect(page.getByText('Show', { exact: true })).toHaveCount(0);
    const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'cafe-cashier @cafe-cashier', exact: true }) });
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(56);
    expect(await row.evaluate(element => getComputedStyle(element).fontSize)).toBe('12px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`user-management-${width}.png`), fullPage: true });
  });

  test(`vendor popup, compact directory and dashboard layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openUsers(page);
    const roleTags = page.locator('tbody tr td:nth-child(3) > span');
    for (const tag of await roleTags.all()) {
      const box = await tag.boundingBox();
      expect(box!.width).toBe(96);
      expect(box!.height).toBe(20);
    }
    await page.getByRole('button', { name: 'View vendor information for Corner Cafe' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const info = await dialog.getByRole('region', { name: 'Vendor details', exact: true }).boundingBox();
    const assigned = await dialog.getByRole('region', { name: 'Assigned users', exact: true }).boundingBox();
    expect(Math.abs(info!.y - assigned!.y)).toBeLessThan(1);
    expect(assigned!.x).toBeGreaterThanOrEqual(info!.x + info!.width - 1);
    expect((await dialog.boundingBox())!.width).toBeGreaterThanOrEqual(Math.min(width - 34, 1152));
    await page.screenshot({ path: test.info().outputPath(`vendor-popup-${width}.png`) });
    await page.keyboard.press('Escape');

    async function openTab(name: string) {
      const menu = page.getByRole('button', { name: 'Open admin menu', exact: true });
      if (await menu.isVisible()) await menu.click();
      await page.getByRole('button', { name, exact: true }).click();
    }
    await openTab('Vendor & Hubs');
    const vendorRow = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'View vendor information for Corner Cafe' }) });
    await expect(vendorRow).toBeVisible();
    expect((await vendorRow.boundingBox())!.height).toBeLessThanOrEqual(56);
    expect(await vendorRow.evaluate(element => getComputedStyle(element).fontSize)).toBe('12px');
    await page.getByRole('button', { name: 'Hubs', exact: true }).click();
    const hubRow = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Main Hub MAIN | Selangor', exact: true }) });
    await expect(hubRow).toBeVisible();
    expect((await hubRow.boundingBox())!.height).toBeLessThanOrEqual(56);

    await openTab('Dashboard');
    const summary = page.getByRole('group', { name: 'Dashboard summary', exact: true });
    await expect(summary).toBeVisible();
    const cards = await summary.locator(':scope > div').all();
    expect(cards).toHaveLength(4);
    const cardBoxes = await Promise.all(cards.map(card => card.boundingBox()));
    for (const box of cardBoxes) expect(Math.abs(box!.y - cardBoxes[0]!.y)).toBeLessThan(1);
    const dates = await page.getByRole('group', { name: 'Dashboard date range', exact: true }).boundingBox();
    const heading = await page.getByRole('heading', { name: 'Dashboard', exact: true }).last().boundingBox();
    expect(dates!.x).toBeGreaterThan(heading!.x + heading!.width);
    expect(dates!.y).toBeLessThan(heading!.y + 80);
    expect(dates!.y + dates!.height).toBeLessThanOrEqual(cardBoxes[0]!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`dashboard-${width}.png`), fullPage: true });
  });
}

test('vendor search, filters and shared vendor information popup work', async ({ page }) => {
  await page.setViewportSize({ width: 1253, height: 900 });
  await openUsers(page);
  await page.getByRole('textbox', { name: 'Search users or vendors' }).fill('Corner Cafe');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByLabel('Filter by access type').selectOption('CASHIER');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'View vendor information for Corner Cafe' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('@cafe-owner', { exact: true })).toBeVisible();
  await expect(dialog.getByText('@cafe-cashier', { exact: true })).toBeVisible();
  await expect(dialog.getByText('@cafe-kitchen', { exact: true })).toBeVisible();
  await expect(dialog.getByText('@bakery-owner', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View vendor information for Corner Cafe' })).toBeFocused();
  await page.getByRole('button', { name: 'Vendor & Hubs', exact: true }).click();
  await page.getByRole('button', { name: 'View vendor information for Corner Cafe' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('@cafe-kitchen', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

for (const viewport of [{ width: 1253, height: 740 }, { width: 1024, height: 600 }, { width: 768, height: 740 }]) {
  test(`vendor popup scrolls only its compact user list at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('https://**.supabase.co/**', async route => {
      if (new URL(route.request().url()).pathname.endsWith('/users')) {
        await route.fulfill({ json: [...users, ...Array.from({ length: 30 }, (_, index) => ({
          id: `staff-${index}`, username: `staff-${index}`, role: 'CASHIER', restaurant_id: 'cafe', is_active: true,
        }))] });
      } else await route.fallback();
    });
    await openUsers(page);
    await page.getByRole('button', { name: 'View vendor information for Corner Cafe' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('header')).toHaveCount(0);
    const list = dialog.getByRole('region', { name: 'Assigned user list', exact: true });
    const info = dialog.getByRole('region', { name: 'Vendor details', exact: true });
    const close = dialog.getByRole('button', { name: 'Close', exact: true });
    const infoBefore = await info.boundingBox();
    const closeBefore = await close.boundingBox();
    expect(await list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    expect((await list.locator('tbody tr').first().boundingBox())!.height).toBeLessThanOrEqual(45);
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect(await dialog.evaluate(element => element.scrollTop)).toBe(0);
    expect(await info.boundingBox()).toEqual(infoBefore);
    expect(await close.boundingBox()).toEqual(closeBefore);
    expect(await info.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
    const bounds = (await dialog.boundingBox())!;
    expect(closeBefore!.y + closeBefore!.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    await expect(close).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`vendor-popup-scroll-${viewport.width}.png`) });
    await close.click();
    await expect(dialog).toHaveCount(0);
  });
}

test('vendor billing history loads five rows per numbered page and fits the fixed panel', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  const records = Array.from({ length: 13 }, (_, index) => ({
    id: `bill-${index}`, restaurant_id: 'cafe', description: `Subscription invoice ${index + 1}`,
    amount: 59, created_at: '2026-11-20T00:00:00Z', created_by: 'wallet', type: 'renewal', reference_code: `REF-${index}`,
  }));
  const requestedPages: number[] = [];
  await page.route('https://**.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith('/billing_records')) return route.fallback();
    expect(url.searchParams.get('restaurant_id')).toBe('eq.cafe');
    const offset = Number(url.searchParams.get('offset') || 0);
    expect(url.searchParams.get('limit')).toBe('5');
    requestedPages.push(offset);
    const rows = records.slice(offset, offset + 5);
    await route.fulfill({ json: rows, headers: { 'content-range': `${offset}-${offset + rows.length - 1}/13`, 'access-control-expose-headers': 'content-range' } });
  });
  await openUsers(page);
  await page.getByRole('button', { name: 'View vendor information for Corner Cafe' }).first().click();
  const dialog = page.getByRole('dialog');
  const billing = dialog.getByRole('region', { name: 'Billing history', exact: true });
  await expect(billing.locator('tbody tr')).toHaveCount(5);
  await expect(billing.getByText('Subscription invoice 1', { exact: true })).toBeVisible();
  await billing.getByRole('button', { name: 'Billing page 2', exact: true }).click();
  await expect(billing.getByText('Subscription invoice 6', { exact: true })).toBeVisible();
  await expect(billing.locator('tbody tr')).toHaveCount(5);
  await billing.getByRole('button', { name: 'Billing page 3', exact: true }).click();
  await expect(billing.getByText('Subscription invoice 11', { exact: true })).toBeVisible();
  await expect(billing.locator('tbody tr')).toHaveCount(3);
  await expect(billing.getByRole('button', { name: 'Next billing page' })).toBeDisabled();
  await billing.getByRole('button', { name: 'Billing page 1', exact: true }).click();
  await expect(billing.locator('tbody tr')).toHaveCount(5);
  const info = dialog.getByRole('region', { name: 'Vendor details', exact: true });
  expect(await info.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  const billingBounds = (await billing.boundingBox())!;
  const footerBounds = (await dialog.locator('footer').boundingBox())!;
  expect(billingBounds.y + billingBounds.height).toBeLessThanOrEqual(footerBounds.y);
  expect(requestedPages).toEqual([0, 5, 10, 0]);
  await page.screenshot({ path: test.info().outputPath('vendor-billing-history.png') });
});

test('vendor billing errors can be retried and empty history is explicit', async ({ page }) => {
  await page.setViewportSize({ width: 1253, height: 740 });
  let billingRequests = 0;
  await page.route('https://**.supabase.co/**', async route => {
    if (!new URL(route.request().url()).pathname.endsWith('/billing_records')) return route.fallback();
    billingRequests += 1;
    await route.fulfill(billingRequests === 1 ? { status: 500, json: { message: 'Test billing failure' } } : { json: [] });
  });
  await openUsers(page);
  await page.getByRole('button', { name: 'View vendor information for Corner Cafe' }).first().click();
  const billing = page.getByRole('region', { name: 'Billing history', exact: true });
  await expect(billing.getByText('Unable to load billing history.', { exact: false })).toBeVisible();
  await billing.getByRole('button', { name: 'Retry' }).click();
  await expect(billing.getByText('No billing records yet.')).toBeVisible();
  await expect(billing.getByRole('navigation')).toHaveCount(0);
});

test('admin can sign in as an assigned user from the vendor popup', async ({ page }) => {
  await page.setViewportSize({ width: 1253, height: 740 });
  await openUsers(page);
  await page.getByRole('button', { name: 'View vendor information for Corner Cafe' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Sign in as cafe-cashier', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('qs_user') || '{}').id)).toBe('cashier');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('qs_role'))).toBe('CASHIER');
  await expect(page.getByRole('button', { name: 'User Management', exact: true })).toHaveCount(0);
});

for (const width of [768, 1024, 1440]) {
  test(`overview cards stretch full width and income filters fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openUsers(page);
    async function openTab(name: string) {
      const menu = page.getByRole('button', { name: 'Open admin menu', exact: true });
      if (await menu.isVisible()) await menu.click();
      await page.getByRole('button', { name, exact: true }).click();
    }
    await openTab('Dashboard');
    const vendors = page.getByRole('region', { name: 'Vendor performance', exact: true });
    const items = page.getByRole('region', { name: 'Top items', exact: true });
    await expect(vendors).toBeVisible();
    const vendorBox = (await vendors.boundingBox())!;
    const itemBox = (await items.boundingBox())!;
    expect(itemBox.width).toBe(vendorBox.width);
    expect(itemBox.x).toBe(vendorBox.x);
    expect(itemBox.y).toBeGreaterThanOrEqual(vendorBox.y + vendorBox.height);
    await expect(page.getByRole('heading', { name: 'Order status', exact: true })).toHaveCount(0);
    await expect(vendors.getByRole('button', { name: /View more/ })).toHaveCount(0);
    await expect(items.getByRole('button', { name: /View more/ })).toHaveCount(0);
    await openTab('Income & Report');
    await expect(page.getByText('No transactions found', { exact: true })).toBeVisible();
    const search = page.getByPlaceholder('Search income, vendor, plan...');
    const payment = page.getByLabel('Income payment method');
    const refresh = page.getByRole('button', { name: 'Apply date range', exact: true });
    const paymentBox = (await payment.boundingBox())!;
    const refreshBox = (await refresh.boundingBox())!;
    expect(Math.abs(paymentBox.y - refreshBox.y)).toBeLessThanOrEqual(1);
    expect((await search.boundingBox())!.height).toBe(36);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`income-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Sales Report', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sales Analysis', exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Sales report type' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Vendor performance', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Top items', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`sales-${width}.png`), fullPage: true });
  });
}

async function prepareLockedVendor(page: import('@playwright/test').Page, billing: boolean, manualLock = false) {
  const subscription = {
    id: 'vendor-subscription', restaurant_id: 'cafe', plan_id: 'pro_plus', status: 'active',
    current_period_end: manualLock ? '2099-12-31T00:00:00Z' : '2020-11-19T00:00:00Z',
    access_locked: manualLock, billing_interval: 'monthly', duitnow_enabled: true, stripe_customer_id: 'customer-test',
  };
  await page.addInitScript(({ subscription, billing }) => {
    localStorage.setItem('qs_user', JSON.stringify({ id: 'owner', username: 'cafe-owner', role: 'VENDOR', restaurantId: 'cafe', isActive: true }));
    localStorage.setItem('qs_role', 'VENDOR');
    localStorage.setItem('qs_view', 'APP');
    localStorage.setItem('qs_cache_subscriptions', JSON.stringify({ cafe: subscription }));
    if (billing) localStorage.setItem('qs_return_tab', 'BILLING');
  }, { subscription, billing });
  await page.route('https://**.supabase.co/**', async route => {
    const table = new URL(route.request().url()).pathname.split('/').pop();
    if (table !== 'subscriptions') return route.fallback();
    const single = route.request().headers().accept?.includes('vnd.pgrst.object');
    await route.fulfill({ json: single ? subscription : [subscription] });
  });
  await page.route('**/api/stripe/billing?**', route => route.fulfill({ json: { methods: [], payments: [] } }));
  await page.route('**/api/wallet?**', route => route.fulfill({ json: { balance: 0, transactions: [] } }));
}

for (const width of [768, 1024, 1253, 1440]) {
  test(`billing plans and payment methods fill three equal columns at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await prepareLockedVendor(page, true);
    await page.goto('/');
    const plans = page.getByRole('group', { name: 'Subscription plans', exact: true });
    await expect(plans).toBeVisible();
    const boxes = await Promise.all((await plans.locator(':scope > div').all()).map(card => card.boundingBox()));
    expect(boxes).toHaveLength(3);
    await expect(plans.getByRole('button', { name: 'Renew', exact: true })).toBeVisible();
    await expect(plans.getByRole('button', { name: 'Switch', exact: true })).toBeVisible();
    await expect(plans.getByRole('button', { name: 'Renew Plan', exact: true })).toHaveCount(0);
    await expect(plans.getByRole('button', { name: 'Switch Plan', exact: true })).toHaveCount(0);
    for (const box of boxes) {
      expect(Math.abs(box!.y - boxes[0]!.y)).toBeLessThan(1);
      expect(Math.abs(box!.width - boxes[0]!.width)).toBeLessThan(1);
    }
    const methods = page.getByRole('region', { name: 'Payment methods', exact: true });
    const grid = methods.locator(':scope > div').last();
    await expect(grid.locator(':scope > *')).toHaveCount(3);
    const cards = await Promise.all((await grid.locator(':scope > *').all()).map(card => card.boundingBox()));
    for (const card of cards) {
      expect(Math.abs(card!.y - cards[0]!.y)).toBeLessThan(1);
      expect(Math.abs(card!.width - cards[0]!.width)).toBeLessThan(1);
    }
    const gridBox = (await grid.boundingBox())!;
    expect(Math.abs(cards[0]!.x - gridBox.x)).toBeLessThan(1);
    expect(Math.abs(cards[2]!.x + cards[2]!.width - gridBox.x - gridBox.width)).toBeLessThan(1);
    expect(await grid.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(Math.abs((cards[1]!.x - cards[0]!.x - cards[0]!.width) - (cards[2]!.x - cards[1]!.x - cards[1]!.width))).toBeLessThan(1);
    await methods.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`billing-methods-${width}.png`) });
  });
}

for (const manualLock of [false, true]) {
  test(`${manualLock ? 'manually locked' : 'expired'} vendor can open reports while counter stays locked`, async ({ page }) => {
    await page.setViewportSize({ width: 1253, height: 900 });
    await prepareLockedVendor(page, false, manualLock);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Please renew plan now', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open reports', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sales Report', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Please renew plan now', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Counter', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Please renew plan now', exact: true })).toBeVisible();
  });
}

for (const width of [768, 1024, 1253]) {
  test(`report download stays inside the period card at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await prepareLockedVendor(page, false);
    await page.goto('/');
    await page.getByRole('button', { name: 'Open reports', exact: true }).click();
    const controls = page.getByRole('group', { name: 'Report period and download', exact: true });
    await expect(controls).toBeVisible();
    const button = controls.getByRole('button', { name: 'Download', exact: true });
    const bounds = (await controls.boundingBox())!;
    const buttonBounds = (await button.boundingBox())!;
    expect(buttonBounds.x).toBeGreaterThanOrEqual(bounds.x);
    expect(buttonBounds.x + buttonBounds.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(buttonBounds.y + buttonBounds.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    expect(await controls.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const buttons = await Promise.all((await controls.getByRole('button').all()).map(option => option.boundingBox()));
    for (const option of buttons) expect(Math.abs(option!.y + option!.height / 2 - buttonBounds.y - buttonBounds.height / 2)).toBeLessThanOrEqual(1);
    await button.click();
    await expect(page.getByRole('heading', { name: 'Download Sales Report', exact: true })).toBeVisible();
  });
}

test('sidebar tightens spacing on shorter screens and scrolls before menu items collide', async ({ page }) => {
  await page.setViewportSize({ width: 1253, height: 1000 });
  await prepareLockedVendor(page, true);
  await page.route('https://**.supabase.co/**', async route => {
    if (!new URL(route.request().url()).pathname.endsWith('/restaurants')) return route.fallback();
    const data = restaurants.map(restaurant => ({ ...restaurant, settings: { features: { qrEnabled: true, onlineShopEnabled: true } } }));
    const single = route.request().headers().accept?.includes('vnd.pgrst.object');
    await route.fulfill({ json: single ? data[0] : data });
  });
  await page.goto('/');
  const sidebar = page.getByRole('complementary', { name: 'POS sidebar', exact: true });
  const nav = sidebar.getByRole('navigation', { name: 'POS navigation', exact: true });
  const counter = nav.getByRole('button', { name: 'Counter', exact: true });
  await expect(counter).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Online Shop', exact: true })).toBeVisible();
  const normalPadding = await counter.evaluate(element => parseFloat(getComputedStyle(element).paddingTop));
  await page.setViewportSize({ width: 1253, height: 740 });
  await expect.poll(() => counter.evaluate(element => parseFloat(getComputedStyle(element).paddingTop))).toBeLessThan(normalPadding);
  expect(await nav.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await expect(nav.getByRole('button', { name: 'Wallet & billing', exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 1253, height: 520 });
  const buttons = await nav.locator(':scope > button').all();
  const boxes = await Promise.all(buttons.map(button => button.boundingBox()));
  for (let index = 0; index < boxes.length; index += 1) {
    expect(boxes[index]!.height).toBeGreaterThanOrEqual(36);
    if (index > 0) expect(boxes[index]!.y).toBeGreaterThanOrEqual(boxes[index - 1]!.y + boxes[index - 1]!.height);
  }
  expect(await nav.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await nav.getByRole('button', { name: 'Wallet & billing', exact: true }).scrollIntoViewIfNeeded();
  await expect(nav.getByRole('button', { name: 'Wallet & billing', exact: true })).toBeInViewport();
  await expect(sidebar.getByRole('button', { name: 'Back Office', exact: true })).toBeInViewport();
});

test('billing history replaces inline details when narrow and restores them when widened', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await prepareLockedVendor(page, true);
  const description = 'SUBSCRIPTION INCOME - DuitNow Renewal (Monthly)';
  await page.route('https://**.supabase.co/**', async route => {
    if (!new URL(route.request().url()).pathname.endsWith('/billing_records')) return route.fallback();
    await route.fulfill({ json: [{ id: 'bill-ui', description, amount: 70, created_at: '2026-11-19T02:08:00Z', created_by: 'duitnow', type: 'paid', reference_code: 'BILL-UI-001' }] });
  });
  await page.goto('/');
  const history = page.getByRole('region', { name: 'Billing history', exact: true });
  await expect(history.getByRole('button', { name: 'Open BILL-UI-001 details', exact: true })).toHaveText('View details');
  await expect(history.locator('tbody tr td')).toHaveCount(6);
  await expect(history.getByText(description, { exact: true })).toHaveCount(0);
  expect(await history.locator('table').evaluate(element => element.scrollWidth <= element.parentElement!.clientWidth)).toBe(true);
  await history.getByRole('button', { name: 'Open BILL-UI-001 details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Billing Transaction Details', exact: true })).toBeVisible();
  await expect(history.getByText(description, { exact: true })).toBeVisible();
  // Dismiss using the existing backdrop, then resize the real container.
  await page.keyboard.press('Escape');
  const backdrop = history.locator('.fixed.inset-0').first();
  await backdrop.click({ position: { x: 1, y: 1 } });
  await page.setViewportSize({ width: 1800, height: 1000 });
  await expect(history.locator('tbody tr td')).toHaveCount(7);
  await expect(history.getByText(description, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(history.getByRole('button', { name: 'Open BILL-UI-001 details', exact: true })).toHaveText('View details');
});

test('narrow cashier summary places its sales total below the cashier without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await prepareLockedVendor(page, false);
  await page.route('**/api/orders/report?**', async route => {
    const summary = { totalRevenue: 3435, orderVolume: 226, efficiency: 100, byCashier: [{ name: 'coffeetraveler.my', count: 162, total: 2634 }], byTransactionType: [{ name: 'QR', count: 226, total: 3435 }] };
    await route.fulfill({ json: { ...summary, summary, orders: [], totalCount: 0 } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open reports', exact: true }).click();
  const cashier = page.getByRole('region', { name: 'Cashier sales summary', exact: true });
  const name = cashier.getByText('coffeetraveler.my', { exact: true });
  const total = cashier.getByText('RM2,634.00', { exact: true });
  await expect(name).toBeVisible();
  await expect(total).toBeVisible();
  const nameBounds = (await name.boundingBox())!;
  const totalBounds = (await total.boundingBox())!;
  expect(totalBounds.y).toBeGreaterThanOrEqual(nameBounds.y + nameBounds.height);
  expect(await cashier.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await cashier.locator('.overflow-y-auto').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const transaction = page.getByRole('region', { name: 'Transaction sales summary', exact: true });
  const transactionName = transaction.getByText('QR', { exact: true });
  const transactionTotal = transaction.getByText('RM3,435.00', { exact: true });
  const transactionNameBounds = (await transactionName.boundingBox())!;
  const transactionTotalBounds = (await transactionTotal.boundingBox())!;
  expect(transactionTotalBounds.y).toBeGreaterThanOrEqual(transactionNameBounds.y + transactionNameBounds.height);
  expect(Math.abs(transactionTotalBounds.x - transactionNameBounds.x)).toBeLessThan(1);
  expect(Math.abs(totalBounds.x - nameBounds.x)).toBeLessThan(1);
  const cashierRow = (await cashier.locator('.overflow-y-auto > div').first().boundingBox())!;
  const transactionRow = (await transaction.locator('.overflow-y-auto > div').first().boundingBox())!;
  expect(cashierRow.height).toBe(transactionRow.height);
  await page.screenshot({ path: test.info().outputPath('aligned-sales-breakdowns.png') });
  await page.setViewportSize({ width: 1800, height: 1000 });
  await expect.poll(async () => {
    const nameBox = (await name.boundingBox())!;
    const totalBox = (await total.boundingBox())!;
    return totalBox.y < nameBox.y + nameBox.height;
  }).toBe(true);
  const wideTransactionName = (await transactionName.boundingBox())!;
  const wideTransactionTotal = (await transactionTotal.boundingBox())!;
  expect(wideTransactionTotal.y).toBeLessThan(wideTransactionName.y + wideTransactionName.height);
});

test('period toolbar progressively shortens Custom and the download button while staying in one row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareLockedVendor(page, false);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open reports', exact: true }).click();
  const controls = page.getByRole('group', { name: 'Report period and download', exact: true });
  const download = controls.getByRole('button', { name: 'Download', exact: true });
  const observed: string[] = [];
  for (let width = 800; width >= 400; width -= 10) {
    await controls.evaluate((element, width) => { element.style.width = `${width}px`; }, width);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const hasText = (await download.textContent())!.includes('Download');
    const hasIcon = await download.locator('svg').count() > 0;
    const custom = await controls.getByRole('button', { name: 'Custom', exact: true }).count() > 0;
    const mode = `${custom ? 'short' : 'full'}:${hasText ? 'text' : ''}${hasIcon ? 'icon' : ''}`;
    if (observed.at(-1) !== mode) observed.push(mode);
    const today = (await controls.getByRole('button', { name: 'Today', exact: true }).boundingBox())!;
    const customBox = (await controls.getByRole('button', { name: custom ? 'Custom' : 'Custom Range', exact: true }).boundingBox())!;
    expect(customBox.y).toBe(today.y);
    expect(await controls.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  expect(observed).toEqual(['full:texticon', 'short:texticon', 'short:text', 'short:icon']);
  await download.click();
  await expect(page.getByRole('heading', { name: 'Download Sales Report', exact: true })).toBeVisible();
});
