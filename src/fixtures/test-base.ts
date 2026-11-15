// Inbuilt fixtures are already available in this case. 

/**
 * test-base — the project's custom Playwright `test`, 
 * pre-wired with a fixture
 * for every TTACart Page Object.
 *
 * Instead of `new LoginPage(page)` in each spec, ask for the page you need and
 * it's handed over already constructed against the test's `page`:
 *
 *   import { test, expect } from '@fixtures/test-base';
 *
 *   test('add to cart', async ({ inventoryPage, cartPage }) => {
 *       await inventoryPage.open();
 *       await inventoryPage.addToCart('tta-bike-light');
 *       await cartPage.open();
 *       expect(await cartPage.rowCount()).toBe(1);
 *   });
 *
 * Plain page-object fixtures hand over constructed objects without navigating.
 * State fixtures (`invalidLogin`, `validLogin`, `loginWithInventory`, and
 * `loginWithSelectedItem`) perform reusable setup only when a test requests one.
 */


import { test as base, expect } from '@playwright/test';
import { LoginPage } from '@pages/LoginPage';
import { InventoryPage } from '@pages/InventoryPage';
import { ItemDetailPage } from '@pages/ItemDetailPage';
import { CartPage } from '@pages/CartPage';
import { CheckoutStepOnePage } from '@pages/CheckoutStepOnePage';
import { CheckoutStepTwoPage } from '@pages/CheckoutStepTwoPage';
import { CheckoutCompletePage } from '@pages/CheckoutCompletePage';
import { analyzeLocatorFailure } from '../ai/agents/selfHealAgent';
import type { HealReport } from '../utils/selfHeal';

import loginTestData from '@testdata/logintestdata.json';


type LoginRecord = {
    username: string;
    password: string;
};

export type InvalidLoginState = {
    loginPage: LoginPage;
    username: string;
};

export type SelectedItemState = {
    inventoryPage: InventoryPage;
    itemId: string;
};


const users = loginTestData as LoginRecord[];
const validUser = users.find(({ username }) => username === 'standard_user');
const invalidUser = users.find(({ username }) => username === 'locked_out_user');
const SELECTED_ITEM_ID = 'test-allthethings-tshirt-red';

if (!validUser || !invalidUser) {
    throw new Error('Required standard_user and locked_out_user test data is missing');
}


export type TestFixture = {

    // Page Objects
    loginPage: LoginPage;
    inventoryPage: InventoryPage;
    itemDetailPage: ItemDetailPage;
    cartPage: CartPage;
    checkoutStepOnePage: CheckoutStepOnePage;
    checkoutStepTwoPage: CheckoutStepTwoPage;
    checkoutCompletePage: CheckoutCompletePage;

    // Ready-to-use application states
    invalidLogin: InvalidLoginState;
    validLogin: LoginPage;
    loginWithInventory: InventoryPage;
    loginWithSelectedItem: SelectedItemState;
    locatorFailureSelfHeal: void;
};

export const test = base.extend<TestFixture>({

    locatorFailureSelfHeal: [async ({ page }, use, testInfo) => {
        await use();

        const failure = testInfo.errors
            .map((error) => [error.message, error.stack].filter(Boolean).join('\n'))
            .join('\n')
            .slice(0, 4_000);
        if (!failure || !/(locator|strict mode violation|waiting for locator|resolved to \d+ elements)/i.test(failure)) {
            return;
        }

        const selectorMatch = failure.match(/locator\((['"`])([\s\S]*?)\1\)/i);
        const failedSelector = selectorMatch?.[2] ?? 'Selector could not be extracted from the Playwright error.';
        let pageSnapshot = '';
        const report: HealReport = {
            failedSelector,
            intent: `Repair the locator used by "${testInfo.title}".`,
            verified: [],
            rejected: [],
            suggestions: [],
        };

        try {
            pageSnapshot = await page.evaluate(() => {
                const redact = (value: string) => value
                    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
                    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, '[redacted-phone]');
                const elements = Array.from(document.querySelectorAll('body *'))
                    .filter((element) => {
                        const tag = element.tagName.toLowerCase();
                        return ['button', 'a', 'input', 'textarea', 'select', 'label'].includes(tag)
                            || element.hasAttribute('role')
                            || element.hasAttribute('data-test')
                            || element.hasAttribute('data-testid');
                    })
                    .slice(0, 160)
                    .map((element) => {
                        const tag = element.tagName.toLowerCase();
                        const attributes = ['role', 'aria-label', 'data-test', 'data-testid', 'type', 'placeholder']
                            .map((name) => [name, element.getAttribute(name)])
                            .filter((entry): entry is [string, string] => entry[1] !== null)
                            .map(([name, value]) => `${name}="${redact(value).slice(0, 120)}"`);
                        const text = ['button', 'a', 'label'].includes(tag)
                            ? redact((element.textContent ?? '').replace(/\s+/g, ' ').trim()).slice(0, 120)
                            : '';
                        return `<${tag}${attributes.length ? ` ${attributes.join(' ')}` : ''}>${text}</${tag}>`;
                    });
                return JSON.stringify({
                    path: window.location.pathname,
                    title: document.title.slice(0, 120),
                    elements,
                }).slice(0, 12_000);
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            report.unavailableReason = `Could not capture the page snapshot: ${message}`;
        }

        try {
            const screenshot = await page.screenshot({ fullPage: true });
            await testInfo.attach('Self-Heal page', {
                body: screenshot,
                contentType: 'image/png',
            });
            report.screenshotAttachment = 'Self-Heal page';
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[Self-Heal] Could not capture page screenshot for "${testInfo.title}": ${message}`);
        }

        if (pageSnapshot) {
            try {
                Object.assign(report, await analyzeLocatorFailure({
                    testTitle: testInfo.title,
                    file: testInfo.file,
                    failedSelector,
                    failure,
                    pageSnapshot,
                    intent: report.intent,
                }));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                report.unavailableReason = `Self-Heal agent failed: ${message}`;
                console.error(`[Self-Heal] Agent failed for "${testInfo.title}": ${message}`);
            }
        } else if (!report.unavailableReason) {
            report.unavailableReason = 'No page snapshot was available for locator analysis.';
        }

        await testInfo.attach('self-heal', {
            body: JSON.stringify(report),
            contentType: 'application/json',
        });
    }, { auto: true }],

    loginPage: async ({ page }, use) => {
        await use(new LoginPage(page));
    },
    inventoryPage: async ({ page }, use) => {
        await use(new InventoryPage(page));
    },
    cartPage: async ({ page }, use) => {
        await use(new CartPage(page));
    },
    checkoutStepOnePage: async ({ page }, use) => {
        await use(new CheckoutStepOnePage(page));
    },
    checkoutStepTwoPage: async ({ page }, use) => {
        await use(new CheckoutStepTwoPage(page));
    },
    checkoutCompletePage: async ({ page }, use) => {
        await use(new CheckoutCompletePage(page));
    },

    // Independent negative state: the locked-out account remains on login.
    invalidLogin: async ({ page, loginPage }, use) => {
        await loginPage.open();
        await loginPage.loginAs(invalidUser.username, invalidUser.password);
        await expect(page.locator('[data-test="error"]')).toBeVisible();
        await use({ loginPage, username: invalidUser.username });
    },
    // Successful authentication state.
    validLogin: async ({ loginPage }, use) => {
        await loginPage.open();
        await loginPage.loginAs(validUser.username, validUser.password);
        await loginPage.waitForLoginButtonHidden();
        await use(loginPage);
    },
    // Depends on validLogin and guarantees that inventory is loaded.
    loginWithInventory: async ({ validLogin, inventoryPage }, use) => {
        void validLogin;
        await inventoryPage.assertLoaded();
        await use(inventoryPage);
    },

    // Depends on inventory and guarantees that one item is in the cart.
    loginWithSelectedItem: async ({ loginWithInventory }, use) => {
        await loginWithInventory.addToCart(SELECTED_ITEM_ID);
        await use({
            inventoryPage: loginWithInventory,
            itemId: SELECTED_ITEM_ID,
        });
    },


})

export { expect };