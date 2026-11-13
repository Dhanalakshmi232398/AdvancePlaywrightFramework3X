/**
 * DataGenerator — Faker-backed and LLM-generated fake data for TTACart.
 *
 * TTACart is a SauceDemo-style storefront: it needs login credentials and
 * checkout customer info (first name, last name, postal code). This util
 * centralises all random data so tests stay deterministic-friendly (one
 * import) and read naturally.
 *
 * Faker API notes:
 *   - `faker.internet.username()`
 *   - `faker.internet.password({ length })`
 *   - `faker.location.zipCode()`
 */

import { faker } from '@faker-js/faker';
import { envOr } from '@config/env';
import { hasApiKey, normalizeProvider, PROVIDERS } from '../ai/config/providers';
import { CHECKOUT_CUSTOMER_PROMPT } from '../ai/prompts/checkoutCustomer';
import { TRANSFER_NOTE_PROMPT } from '../ai/prompts/transferNote';
import { generateJson } from '../ai/llmGateway';

function shouldFallbackToFaker(): boolean {
    const selectedProvider = process.env.LLM_PROVIDER?.trim();
    const configuredKeyCount = Object.values(PROVIDERS).filter(
        ({ apiKeyEnv }) => (process.env[apiKeyEnv] ?? '').trim().length > 0,
    ).length;

    if (!selectedProvider) return configuredKeyCount === 0;

    const provider = normalizeProvider(selectedProvider);
    return provider !== undefined
        && !(process.env[PROVIDERS[provider].apiKeyEnv] ?? '').trim();
}

export interface Credentials {
    username: string;
    password: string;
}

export interface CheckoutCustomer {
    firstName: string;
    lastName: string;
    postalCode: string;
}

export interface UserProfile extends Credentials, CheckoutCustomer {
    email: string;
    fullName: string;
    phone: string;
}

export class DataGenerator {
    // ---------- credentials ----------

    /** Random username, e.g. "Otilia35". */
    static username(): string {
        return faker.internet.username();
    }

    /**
     * Random password. Defaults to a 12-char password.
     * Pass length to tune for negative-test cases.
     */
    static password(length = 12): string {
        return faker.internet.password({ length });
    }

    /** Username + password pair. */
    static credentials(): Credentials {
        return {
            username: DataGenerator.username(),
            password: DataGenerator.password(),
        };
    }

    // ---------- contact ----------

    static firstName(): string {
        return faker.person.firstName();
    }

    static lastName(): string {
        return faker.person.lastName();
    }

    static email(): string {
        return faker.internet.email();
    }

    static phone(): string {
        return faker.phone.number();
    }

    static postalCode(): string {
        return faker.location.zipCode();
    }

    static transferNote(): string {
        const words = faker.lorem.words(8).split(' ');
        const note: string[] = [];

        for (const word of words) {
            const candidate = [...note, word].join(' ');
            if (candidate.length > 60) break;
            note.push(word);
        }

        return note.join(' ');
    }

    /** Generates a short transfer note through the configured LLM provider. */
    static async transferNoteFromAI(): Promise<string> {
        if (!hasApiKey() && shouldFallbackToFaker()) {
            console.warn(
                '[DataGenerator] No API key for the selected LLM provider; skipping AI and using a Faker transfer note.',
            );
            return DataGenerator.transferNote();
        }

        const response = await generateJson<unknown>(TRANSFER_NOTE_PROMPT);
        if (!response || typeof response !== 'object' || Array.isArray(response) || !('note' in response)) {
            throw new Error('LLM returned invalid transfer note data.');
        }

        const value = response.note;
        if (typeof value !== 'string') {
            throw new Error('LLM returned invalid transfer note data: note must be a string.');
        }

        const note = value.trim().replace(/\s+/g, ' ');
        if (note.length === 0 || note.length > 60) {
            throw new Error('LLM returned invalid transfer note data: note must be 1-60 characters.');
        }
        return note;
    }

    // ---------- primitives ----------

    /** Whole number in an inclusive range, e.g. a price or a quantity. */
    static number(min: number, max: number): number {
        return faker.number.int({ min, max });
    }

    /** Random true/false, for flags such as depositpaid. */
    static bool(): boolean {
        return faker.datatype.boolean();
    }

    /**
     * Date as `YYYY-MM-DD`, offset from a reference date.
     * Pass a negative offset for the past. `from` defaults to today, so
     * generated dates move with the calendar instead of ageing into the past.
     */
    static dateOffset(days: number, from: Date = new Date()): string {
        const d = new Date(from);
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().slice(0, 10);
    }

    /** Pick one item from a list. Throws on an empty list rather than returning undefined. */
    static oneOf<T>(items: readonly T[]): T {
        if (items.length === 0) {
            throw new Error('[DataGenerator] oneOf() needs a non-empty list');
        }
        return faker.helpers.arrayElement(items);
    }

    // ---------- composites ----------

    /** Customer info for the TTACart checkout step-one form. */
    static checkoutCustomer(): CheckoutCustomer {
        return {
            firstName: DataGenerator.firstName(),
            lastName: DataGenerator.lastName(),
            postalCode: DataGenerator.postalCode(),
        };
    }

    /** Generates fictional checkout data through the configured LLM provider. */
    static async checkoutCustomerFromAI(): Promise<CheckoutCustomer> {
        if (!hasApiKey() && shouldFallbackToFaker()) {
            console.warn(
                '[DataGenerator] No API key for the selected LLM provider; skipping AI and using Faker checkout data.',
            );
            return DataGenerator.checkoutCustomer();
        }

        const response = await generateJson<unknown>(CHECKOUT_CUSTOMER_PROMPT);
        if (!response || typeof response !== 'object' || Array.isArray(response)) {
            throw new Error('LLM returned invalid checkout customer data.');
        }

        const fieldAliases: Record<string, string[]> = {
            firstName: ['firstname'],
            lastName: ['lastname'],
            postalCode: ['postalcode', 'zipcode', 'zip'],
        };
        const normalizeKey = (key: string) => key.replace(/[^a-z]/gi, '').toLowerCase();
        const findCustomer = (value: unknown): Record<string, unknown> | undefined => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
            const record = value as Record<string, unknown>;
            const keys = Object.keys(record).map(normalizeKey);
            if (Object.values(fieldAliases).every((aliases) => keys.some((key) => aliases.includes(key)))) {
                return record;
            }

            for (const nested of Object.values(record)) {
                const customer = findCustomer(nested);
                if (customer) return customer;
            }
            return undefined;
        };
        const customer = findCustomer(response);
        if (!customer) {
            throw new Error('LLM response is missing firstName, lastName, or postalCode.');
        }
        const readField = (field: string): unknown => {
            const aliases = fieldAliases[field];
            const key = Object.keys(customer).find((name) => aliases.includes(normalizeKey(name)));
            return key ? customer[key] : undefined;
        };
        const normalizeName = (field: string): string => {
            const value = readField(field);
            if (typeof value !== 'string') {
                throw new Error(`LLM returned invalid checkout customer data: ${field} must be a string.`);
            }

            const name = value.trim().replace(/\s+/g, ' ');
            if (name.length > 50 || !/^\p{L}[\p{L}\p{M}]*(?:[ '\u2019-]\p{L}[\p{L}\p{M}]*)*$/u.test(name)) {
                throw new Error(`LLM returned invalid checkout customer data: ${field} must be a valid name.`);
            }
            return name;
        };

        const postalCode = readField('postalCode');
        if (typeof postalCode !== 'string' || !/^\d{5}$/.test(postalCode.trim())) {
            throw new Error('LLM returned invalid checkout customer data: postalCode must be 5 digits.');
        }

        return {
            firstName: normalizeName('firstName'),
            lastName: normalizeName('lastName'),
            postalCode: postalCode.trim(),
        };
    }

    /** Checkout customer, `.env` first, Faker for any field left unset. */
    static checkoutCustomerFromEnv(): CheckoutCustomer {
        const generated = DataGenerator.checkoutCustomer();
        return {
            firstName: envOr('CHECKOUT_FIRST_NAME', generated.firstName),
            lastName: envOr('CHECKOUT_LAST_NAME', generated.lastName),
            postalCode: envOr('CHECKOUT_POSTAL_CODE', generated.postalCode),
        };
    }

    /** Full profile — creds + checkout fields + contact. */
    static userProfile(): UserProfile {
        const firstName = DataGenerator.firstName();
        const lastName = DataGenerator.lastName();
        return {
            username: DataGenerator.username(),
            password: DataGenerator.password(),
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`,
            email: faker.internet.email({ firstName, lastName }),
            phone: DataGenerator.phone(),
            postalCode: DataGenerator.postalCode(),
        };
    }
}

export default DataGenerator;