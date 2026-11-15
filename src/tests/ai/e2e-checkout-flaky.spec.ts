import { test, expect } from '@fixtures/test-base';
import { DataGenerator } from '@utils/DataGenerator';
import { visualStep } from '@utils/visualSteps';

const FIRST_ITEM_ID = 'test-allthethings-tshirt-red';

test.describe('@Regression E2E @Checkout Flaky Validation', () => {
    test('should complete checkout consistently across repeated runs', async ({
        page,
        validLogin,
        inventoryPage,
        cartPage,
        checkoutStepOnePage,
        checkoutStepTwoPage,
        checkoutCompletePage,
    }, testInfo) => {
        await visualStep(page, 'Inventory page: add first item to cart', async () => {
            await inventoryPage.assertLoaded();
            await inventoryPage.addToCart(FIRST_ITEM_ID);
        });

        await visualStep(page, 'Cart page: verify one item in cart', async () => {
            await cartPage.open();
            expect(await cartPage.rowCount()).toBe(1);
        });

        await visualStep(page, 'Checkout step one: enter customer details', async () => {
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
        });

        await visualStep(page, 'Checkout step two: review order overview', async () => {
            await checkoutStepOnePage.continue();
            await checkoutStepTwoPage.assertLoaded();
        });

        await visualStep(page, 'Checkout complete: finish and verify confirmation', async () => {
            await checkoutStepTwoPage.finish();
            await checkoutCompletePage.assertOrderComplete();
        });
    });
});
