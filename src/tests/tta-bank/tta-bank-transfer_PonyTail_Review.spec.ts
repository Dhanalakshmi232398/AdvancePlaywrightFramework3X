import { test, expect, type Dialog } from '@playwright/test';
import { DataGenerator } from '@utils/DataGenerator';
import { visualStep } from '@utils/visualSteps';

const BANK_PATH = '/playwright/tta-bank/';
const BANK_EMAIL = process.env.TTA_BANK_EMAIL ?? 'priya.tester@ttabank.in';
const BANK_PASSWORD = process.env.TTA_BANK_PASSWORD ?? 'Test@1234';

test.describe('@P0 @Regression TTA Bank transfers', () => {
    test('should send ₹5,000 to Meera Iyer and verify the updated balance', async ({ page }) => {
        await visualStep(page, 'Sign in to TTA Bank', async () => {
            await page.goto(BANK_PATH);
            await page.getByLabel('Email address').fill(BANK_EMAIL);
            await page.getByLabel('Password').fill(BANK_PASSWORD);
            await page.getByRole('button', { name: 'Sign in', exact: true }).click();
            await expect(page).toHaveURL(/\/playwright\/tta-bank\/dashboard/);
        });

        await visualStep(page, 'Verify opening balance and credit transaction', async () => {
            const balance = page.getByRole('region', { name: 'Account balance' });
            await expect(balance).toContainText('₹50,000');

            const transactions = page.getByRole('table', { name: 'Recent transactions table' });
            const openingCredit = transactions.getByRole('row').filter({ hasText: 'TTA Bank' });
            await expect(openingCredit).toContainText('credit');
            await expect(openingCredit).toContainText('+₹50,000');
        });

        await visualStep(page, 'Select Meera Iyer and enter transfer details', async () => {
            await page.getByRole('main').getByRole('link', { name: /send money/i }).click();
            await expect(page).toHaveURL(/\/playwright\/tta-bank\/send/);

            await page.getByRole('option', { name: /Meera Iyer/ }).click();
            await page.getByRole('spinbutton', { name: 'Amount in rupees' }).fill('5000');
            await page.getByRole('combobox', { name: 'Expense category' }).selectOption({
                label: 'Travel',
            });

            const note = await DataGenerator.transferNoteFromAI();
            await page.getByRole('textbox', { name: 'Transfer note' }).fill(note);
            await expect(page.getByRole('textbox', { name: 'Transfer note' })).toHaveValue(note);
        });

        await visualStep(page, 'Review and confirm transfer', async () => {
            await page.getByRole('button', { name: 'Review transfer' }).click();
            const confirmation = page.getByRole('dialog', { name: 'Confirm transfer' });
            await expect(confirmation).toBeVisible();
            await expect(confirmation).toContainText('Meera Iyer');
            await expect(confirmation).toContainText('₹5,000');
            await expect(confirmation).toContainText('Travel');
            await confirmation.getByRole('button', { name: 'Confirm and send' }).click();
            await expect(page.getByRole('status')).toContainText('New balance ₹45,000');
        });

        await visualStep(page, 'Verify recent debit and post-transfer balance', async () => {
            await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
            await expect(page).toHaveURL(/\/playwright\/tta-bank\/dashboard/);

            const balance = page.getByRole('region', { name: 'Account balance' });
            await expect(balance).toContainText('₹45,000');

            const transactions = page.getByRole('table', { name: 'Recent transactions table' });
            const debit = transactions.getByRole('row').filter({ hasText: 'Meera Iyer' });
            await expect(debit).toContainText('debit');
            await expect(debit).toContainText('Travel');
            await expect(debit).toContainText('-₹5,000');
        });

        await visualStep(page, 'Verify reset dialog and click OK', async () => {
            await page.getByRole('navigation', { name: 'Bank menu' })
                .getByRole('link', { name: 'Transactions', exact: true }).click();
            await expect(page).toHaveURL(/\/playwright\/tta-bank\/transactions/);

            const resetButton = page.getByRole('button', {
                name: 'Reset account to the starting balance',
            });
            await expect(resetButton).toBeVisible();

            const resetDialogHandled = new Promise<void>((resolve, reject) => {
                const handleResetDialog = async (dialog: Dialog) => {
                    try {
                        expect(dialog.type()).toBe('confirm');
                        expect(dialog.message()).toMatch(/reset/i);
                        // Keep the native dialog visible briefly in headed runs.
                        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
                        await dialog.accept();
                        await test.info().attach('step-5-logs', {
                            body: `Native browser confirm dialog: ${dialog.message()}\nClicked OK: yes`,
                            contentType: 'text/plain',
                        });
                        resolve();
                    } catch (error) {
                        reject(error);
                    } finally {
                        page.off('dialog', handleResetDialog);
                    }
                };
                page.on('dialog', handleResetDialog);
            });
            await resetButton.click();
            await resetDialogHandled;
        });

        await visualStep(page, 'Verify dashboard balance after reset', async () => {
            await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
            await expect(page).toHaveURL(/\/playwright\/tta-bank\/dashboard/);
            await expect(page.getByRole('region', { name: 'Account balance' }))
                .toContainText('₹50,000');
        });
    });
});