/**
 * visualStep — like `test.step`, with a screenshot attached at the end of
 * every step for the TTA report.
 *
 *   await visualStep(page, 'Open the cart', async () => {
 *       await cartPage.open();
 *   });
 *
 * The reporter (CustomReporter.ts) matches an attachment named
 * `step-<index>-...` to the step at that index. We keep a per-test counter
 * (the steps run sequentially, so the order matches the reporter's own step
 * numbering) and attach the PNG under that exact name.
 */

import { test, type Page, type TestInfo } from '@playwright/test';

// Per-test step counter. WeakMap so it's scoped to each TestInfo and never
// leaks across tests (each test gets a fresh TestInfo → fresh count from 0).
const stepCounters = new WeakMap<TestInfo, number>();

function slugify(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

export async function visualStep(
    page: Page,
    title: string,
    body: () => Promise<void>,
): Promise<void> {
    await test.step(title, async () => {
        await body();

        const info = test.info();
        const index = stepCounters.get(info) ?? 0;
        stepCounters.set(info, index + 1);

        await info.attach(`step-${index}-${slugify(title)}`, {
            body: await page.screenshot(),
            contentType: 'image/png',
        });
    });
}