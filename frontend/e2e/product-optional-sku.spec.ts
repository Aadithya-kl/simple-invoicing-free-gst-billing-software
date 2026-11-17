import {
  test,
  expect,
  expectSuccess,
  clickNavLink,
  catalogueRow,
  catalogueSearch,
  showMoreProductOptions,
} from './fixtures';

/**
 * The SKU is optional: left blank, one is made from the product name. The
 * catalogue form keeps rarely used fields behind "More options" and
 * remembers, per browser, whether that was left open and which of those
 * fields the last new product used.
 */

const EXPECT_TIMEOUT_MS = Number(process.env.E2E_EXPECT_TIMEOUT_MS || '5000');

/** Unique per run, and short enough that the made code is not cut off. */
function runTag() {
  return Date.now().toString(36).toUpperCase();
}

async function openNewProduct(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'New product' }).click();
  const modal = page.getByRole('dialog', { name: 'Add a product' });
  await expect(modal).toBeVisible({ timeout: EXPECT_TIMEOUT_MS });
  return modal;
}

test.describe('Optional SKU and More options', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.evaluate(() => localStorage.removeItem('product_form_prefs'));
    await clickNavLink(page, '/catalogue');
  });

  test('a blank SKU is made from the name, and a repeat name gets -2', async ({ authedPage: page }) => {
    const tag = runTag();
    const name = `Masala Tea ${tag}`;
    const code = `MASALA-TEA-${tag}`;

    for (const expected of [code, `${code}-2`]) {
      const modal = await openNewProduct(page);
      await expect(modal.locator('#product-name')).toBeFocused();
      await expect(modal.locator('#product-sku')).toHaveAttribute('placeholder', 'Made from the name');
      await modal.locator('#product-name').fill(name);
      await modal.locator('#product-price').fill('40');
      await modal.locator('#product-gst').selectOption('5');
      await modal.locator('#product-initial-qty').fill('10');
      await modal.getByRole('button', { name: 'Create product' }).click();

      await expectSuccess(page, `${name} created. Item code: ${expected}.`);
      await expect(modal).toBeHidden({ timeout: EXPECT_TIMEOUT_MS });
    }

    await catalogueSearch(page).fill(code);
    await expect(catalogueRow(page, `${code}-2`)).toBeVisible({ timeout: EXPECT_TIMEOUT_MS });
    await expect(page.locator('tr.catalogue-row')).toHaveCount(2);
  });

  test('More options starts closed and remembers what was used', async ({ authedPage: page }) => {
    const tag = runTag();

    // A first product: the basics only.
    let modal = await openNewProduct(page);
    await expect(modal.locator('#product-more-options')).not.toBeChecked();
    await expect(modal.locator('#product-purchase-price')).toHaveCount(0);
    await expect(modal.locator('#product-reorder')).toHaveCount(0);
    await expect(modal.getByText('How this product is tracked')).toHaveCount(0);

    // Open it, use one option, and save.
    await showMoreProductOptions(modal);
    await expect(modal.locator('#product-purchase-price')).toBeVisible();
    await expect(modal.getByText('Track individual serial numbers / IMEIs')).toBeVisible();
    await modal.locator('#product-name').fill(`Steel Bottle ${tag}`);
    await modal.locator('#product-price').fill('350');
    await modal.locator('#product-gst').selectOption('18');
    await modal.locator('#product-purchase-price').fill('210');
    await modal.locator('#product-initial-qty').fill('4');
    await modal.getByRole('button', { name: 'Create product' }).click();
    await expectSuccess(page, `Steel Bottle ${tag} created.`);

    // Left open, so it opens open.
    modal = await openNewProduct(page);
    await expect(modal.locator('#product-more-options')).toBeChecked();
    await expect(modal.locator('#product-description')).toBeVisible();

    // Closed now: the purchase price used last time stays, the rest go.
    await modal.locator('#product-more-options').uncheck();
    await expect(modal.locator('#product-purchase-price')).toBeVisible();
    await expect(modal.locator('#product-description')).toHaveCount(0);
    await modal.getByRole('button', { name: 'Cancel' }).click();

    // And that survives a reload.
    await page.reload();
    modal = await openNewProduct(page);
    await expect(modal.locator('#product-more-options')).not.toBeChecked();
    await expect(modal.locator('#product-purchase-price')).toBeVisible();
    await expect(modal.locator('#product-reorder')).toHaveCount(0);
    await modal.getByRole('button', { name: 'Cancel' }).click();
  });

  test('the invoice quick-create takes a blank SKU too', async ({ authedPage: page }) => {
    const tag = runTag();
    const name = `Quick Chai ${tag}`;

    await clickNavLink(page, '/invoices');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New product' }).click();
    const modal = page.getByRole('dialog', { name: 'Create product' });
    await expect(modal).toBeVisible();

    await modal.locator('#modal-product-name').fill(name);
    await expect(modal.locator('#modal-product-sku')).not.toHaveAttribute('required', '');
    await modal.locator('#modal-product-price').fill('20');
    await modal.locator('#modal-product-gst-rate').selectOption('5');
    await modal.locator('#modal-product-opening-stock').fill('5');
    await modal.getByRole('button', { name: 'Save product' }).click();

    await expectSuccess(page, 'Product created and added to the invoice.');
    const productInputId = (await page.locator('[id^="invoice-product-"]').first().getAttribute('id')) || 'invoice-product-1';
    await expect(page.locator(`#${productInputId}`)).toHaveValue(`${name} (QUICK-CHAI-${tag})`);
  });
});
