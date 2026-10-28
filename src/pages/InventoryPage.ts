import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class InventoryPage extends BasePage {
    static readonly PATH = '/playwright/ttacart/inventory.html';

    private readonly title: Locator;
    private readonly sortDropdown: Locator;
    private readonly items: Locator;
    private readonly itemNames: Locator;
    private readonly itemPrices: Locator;
    private readonly cartLink: Locator;
    private readonly cartBadge: Locator;

    constructor(page: Page) {
        super(page, 'InventoryPage');
        this.title = page.locator('[data-test="title"]');
        this.sortDropdown = page.locator('[data-test="product-sort-container"]');
        this.items = page.locator('[data-test="inventory-item"]');
        this.itemNames = page.locator('[data-test="inventory-item-name"]');
        this.itemPrices = page.locator('[data-test="inventory-item-price"]');
        this.cartLink = page.locator('[data-test="shopping-cart-link"]');
        this.cartBadge = page.locator('[data-test="shopping-cart-badge"]');
    }

    async open(): Promise<void> {
        await this.goto(InventoryPage.PATH);
        await this.assertLoaded();
    }

    async assertLoaded(): Promise<void> {
        await expect(this.title).toHaveText('Products');
        await expect.poll(async () => this.items.count()).toBeGreaterThan(3);
    }

    async productNames(): Promise<string[]> {
        return this.el.getAllTexts(this.itemNames);
    }


    private addBtn(id: string): Locator {
        return this.page.locator(`[data-test="add-to-cart-${id}"]`);
    }
    private removeBtn(id: string): Locator {
        return this.page.locator(`[data-test="remove-${id}"]`);
    }

    async addToCart(id: string): Promise<void> {
        await this.el.click(this.addBtn(id));
    }

    async removeFromCart(id: string): Promise<void> {
        await this.el.click(this.removeBtn(id));
    }

    async openCart(): Promise<void> {
        await this.el.click(this.cartLink);
        await this.page.waitForLoadState('domcontentloaded');
    }

    async openItem(id: string): Promise<void> {
        await this.el.click(this.page.locator(`[data-test="item-${id}-title-link"]`));
        await this.page.waitForLoadState('domcontentloaded');
    }


}

/* import { type Locator, type Page } from '@playwright/test';

export class Inventorypage {
  readonly page: Page;
  readonly title: Locator;
  readonly firstItemName: Locator;
  readonly firstItemAddToCart: Locator;
  readonly cartLink: Locator;

  constructor(page: Page) {
    this.page = page;

    // TTACart tags elements with data-test, not Playwright's default
    // data-testid, so the page object owns that detail instead of making
    // every spec declare test.use({ testIdAttribute: 'data-test' }).
    const byTest = (id: string) => page.locator(`[data-test="${id}"]`);

    this.title = byTest('title');
    this.firstItemName = byTest('inventory-item-name').first();
    this.firstItemAddToCart = page.getByRole('button', { name: 'Add to cart' }).first();
    this.cartLink = byTest('shopping-cart-link');
  }

  async goto() {
    await this.page.goto('https://app.thetestingacademy.com/playwright/ttacart/inventory');
  }

  /** Adds the first product and returns its name, so the test can assert on it. */
/*   async addFirstItemToCart(): Promise<string> {
    const name = (await this.firstItemName.innerText()).trim();
    await this.firstItemAddToCart.click();
    return name;
  }

  async openCart() {
    await this.cartLink.click();
  }
} */ 