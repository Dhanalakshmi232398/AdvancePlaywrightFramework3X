import { readFileSync } from 'node:fs';
import path from 'node:path';

export const CHECKOUT_CUSTOMER_PROMPT = readFileSync(
    path.join(__dirname, 'checkoutCustomer.prompt.md'),
    'utf8',
).trim();
