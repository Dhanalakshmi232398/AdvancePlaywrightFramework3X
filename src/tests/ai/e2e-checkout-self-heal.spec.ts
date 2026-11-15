import { expect, test } from '@fixtures/test-base';
import { DataGenerator } from '@utils/DataGenerator';

const FIRST_ITEM_ID = 'test-allthethings-tshirt-red';

test.describe('@Regression E2E @Checkout Self-Heal Feature', () => {
    test('suggests a replacement for a broken checkout locator', async ({
        page,
        validLogin,
        inventoryPage,
        cartPage,
        checkoutStepOnePage,
        checkoutStepTwoPage,
        checkoutCompletePage,
    }, testInfo) => {
        await inventoryPage.assertLoaded();
        await inventoryPage.addToCart(FIRST_ITEM_ID);
        await cartPage.open();
        await cartPage.checkout();
        await checkoutStepOnePage.assertLoaded();

        const generation = await DataGenerator.checkoutCustomerFromAIWithSource();
        await testInfo.attach('ai-data', {
            body: JSON.stringify(generation),
            contentType: 'application/json',
        });
        await checkoutStepOnePage.fillGuest(generation.customer);
        await expect(page.locator('[data-test="firstName"]')).toHaveValue(generation.customer.firstName);
        await expect(page.locator('[data-test="lastName"]')).toHaveValue(generation.customer.lastName);
        await expect(page.locator('[data-test="postalCode"]')).toHaveValue(generation.customer.postalCode);

        await checkoutStepOnePage.continue();
        await checkoutStepTwoPage.assertLoaded();

        await checkoutStepTwoPage.finish();
        await checkoutCompletePage.assertOrderComplete();

        await page.locator('[data-test="orderConfirmationMessage"]').waitFor({ timeout: 1_500 });
    });
});
