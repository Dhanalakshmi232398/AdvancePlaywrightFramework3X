import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DataGenerator } from '@utils/DataGenerator';
import { generateJson, generateJsonFile } from '../../ai/llmGateway';

const providerKeys = [
    'OPENROUTER_API_KEY',
    'GROQ_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
    'GOOGLE_API_KEY',
    'LLM_PROVIDER',
    'LLM_MODEL',
    'OPENROUTER_MODEL',
    'GROQ_MODEL',
    'OPENAI_MODEL',
    'ANTHROPIC_MODEL',
    'DEEPSEEK_MODEL',
    'GOOGLE_MODEL',
];

test.describe('LLM gateway', () => {
    test.describe.configure({ mode: 'serial' });

    let savedEnvironment: Map<string, string | undefined>;
    let savedFetch: typeof fetch;

    test.beforeEach(() => {
        savedEnvironment = new Map(
            providerKeys.map((name) => [name, process.env[name]]),
        );
        for (const name of providerKeys) delete process.env[name];
        savedFetch = globalThis.fetch;
    });

    test.afterEach(() => {
        for (const [name, value] of savedEnvironment) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
        globalThis.fetch = savedFetch;
    });

    test('requests JSON from an OpenAI-compatible provider', async () => {
        process.env.LLM_PROVIDER = 'openai';
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.LLM_MODEL = 'environment-model';
        globalThis.fetch = async (input, init) => {
            expect(String(input)).toBe('https://api.openai.com/v1/chat/completions');
            expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-openai-key');
            const body = JSON.parse(String(init?.body)) as {
                model: string;
                response_format: { type: string };
            };
            expect(body.model).toBe('test-model');
            expect(body.response_format.type).toBe('json_object');
            return new Response(JSON.stringify({
                choices: [{ message: { content: '{"answer":42}' } }],
            }), { status: 200 });
        };

        await expect(generateJson<{ answer: number }>('Return an answer', { model: 'test-model' }))
            .resolves.toEqual({ answer: 42 });
    });

    test('supports direct Anthropic requests and the Claude alias', async () => {
        process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
        globalThis.fetch = async (input, init) => {
            expect(String(input)).toBe('https://api.anthropic.com/v1/messages');
            const headers = new Headers(init?.headers);
            expect(headers.get('x-api-key')).toBe('test-anthropic-key');
            expect(headers.has('authorization')).toBe(false);
            const body = JSON.parse(String(init?.body)) as { system: string };
            expect(body.system).toContain('valid JSON');
            return new Response(JSON.stringify({
                content: [{ type: 'text', text: '{"ok":true}' }],
            }), { status: 200 });
        };

        await expect(generateJson<{ ok: boolean }>('Return ok', { provider: 'claude' }))
            .resolves.toEqual({ ok: true });
    });

    test('supports Google Gemini JSON generation', async () => {
        process.env.LLM_PROVIDER = 'google';
        process.env.GOOGLE_API_KEY = 'test-google-key';
        globalThis.fetch = async (input, init) => {
            expect(String(input)).toBe(
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            );
            expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-google-key');
            const body = JSON.parse(String(init?.body)) as {
                generationConfig: { responseMimeType: string };
            };
            expect(body.generationConfig.responseMimeType).toBe('application/json');
            return new Response(JSON.stringify({
                candidates: [{ content: { parts: [{ text: '{"provider":"google"}' }] } }],
            }), { status: 200 });
        };

        await expect(generateJson<{ provider: string }>('Return provider', { provider: 'google' }))
            .resolves.toEqual({ provider: 'google' });
    });

    test('requires an explicit provider when multiple API keys are configured', async () => {
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.GROQ_API_KEY = 'test-groq-key';

        await expect(generateJson('Return JSON'))
            .rejects.toThrow('Set LLM_PROVIDER because API keys are configured for multiple providers.');
    });

    test('reports the supported key names when no provider key is configured', async () => {
        await expect(generateJson('Return JSON'))
            .rejects.toThrow('No LLM API key is configured. Add one of these variables');
    });

    test('uses Faker checkout data and warns when no provider key is configured', async () => {
        const warnings: string[] = [];
        const originalWarn = console.warn;
        console.warn = (...messages: Parameters<typeof console.warn>) => {
            warnings.push(messages.join(' '));
        };
        globalThis.fetch = async () => {
            throw new Error('The gateway should not be called without a provider key.');
        };

        try {
            const customer = await DataGenerator.checkoutCustomerFromAI();
            expect(customer.firstName).toBeTruthy();
            expect(customer.lastName).toBeTruthy();
            expect(customer.postalCode).toBeTruthy();
            expect(warnings.join(' ')).toContain('skipping AI and using Faker');
        } finally {
            console.warn = originalWarn;
        }
    });

    test('writes the parsed JSON response to a file', async () => {
        process.env.LLM_PROVIDER = 'deepseek';
        process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
        globalThis.fetch = async () => new Response(JSON.stringify({
            choices: [{ message: { content: '{"items":["a","b"]}' } }],
        }), { status: 200 });

        const directory = await mkdtemp(path.join(os.tmpdir(), 'llm-gateway-'));
        const outputPath = path.join(directory, 'nested', 'result.json');
        try {
            const result = await generateJsonFile<{ items: string[] }>(
                outputPath,
                'Return items',
            );
            expect(result).toEqual({ items: ['a', 'b'] });
            expect(await readFile(outputPath, 'utf8')).toBe('{\n  "items": [\n    "a",\n    "b"\n  ]\n}\n');
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    test('generates checkout customer data through the LLM gateway', async () => {
        process.env.LLM_PROVIDER = 'deepseek';
        process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
        globalThis.fetch = async (_input, init) => {
            const body = JSON.parse(String(init?.body)) as {
                messages: { role: string; content: string }[];
            };
            const prompt = body.messages.find((message) => message.role === 'user')?.content;
            expect(prompt).toContain('5 numeric digits');
            return new Response(JSON.stringify({
                choices: [{
                    message: {
                        content: '{"data":{"First Name":"Taylor","LastName":"Morgan","zip":"00000"}}',
                    },
                }],
            }), { status: 200 });
        };

        await expect(DataGenerator.checkoutCustomerFromAI()).resolves.toEqual({
            firstName: 'Taylor',
            lastName: 'Morgan',
            postalCode: '00000',
        });
    });

    test('generates a transfer note through the LLM gateway', async () => {
        process.env.LLM_PROVIDER = 'deepseek';
        process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
        globalThis.fetch = async (_input, init) => {
            const body = JSON.parse(String(init?.body)) as {
                messages: { role: string; content: string }[];
            };
            const prompt = body.messages.find((message) => message.role === 'user')?.content;
            expect(prompt).toContain('1-60 characters');
            return new Response(JSON.stringify({
                choices: [{ message: { content: '{"note":"Tickets booked for the summer trip"}' } }],
            }), { status: 200 });
        };

        await expect(DataGenerator.transferNoteFromAI())
            .resolves.toBe('Tickets booked for the summer trip');
    });

    test('uses a Faker transfer note and warns when no provider key is configured', async () => {
        const warnings: string[] = [];
        const originalWarn = console.warn;
        console.warn = (...messages: Parameters<typeof console.warn>) => {
            warnings.push(messages.join(' '));
        };
        globalThis.fetch = async () => {
            throw new Error('The gateway should not be called without a provider key.');
        };

        try {
            const note = await DataGenerator.transferNoteFromAI();
            expect(note.length).toBeGreaterThan(0);
            expect(note.length).toBeLessThanOrEqual(60);
            expect(warnings.join(' ')).toContain('skipping AI and using a Faker');
        } finally {
            console.warn = originalWarn;
        }
    });

    test('rejects a transfer note longer than the form limit', async () => {
        process.env.LLM_PROVIDER = 'deepseek';
        process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
        globalThis.fetch = async () => new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ note: 'x'.repeat(61) }) } }],
        }), { status: 200 });

        await expect(DataGenerator.transferNoteFromAI())
            .rejects.toThrow('note must be 1-60 characters');
    });

    test('rejects a response that is not valid JSON', async () => {
        process.env.LLM_PROVIDER = 'groq';
        process.env.GROQ_API_KEY = 'test-groq-key';
        globalThis.fetch = async () => new Response(JSON.stringify({
            choices: [{ message: { content: 'not json' } }],
        }), { status: 200 });

        await expect(generateJson('Return JSON'))
            .rejects.toThrow('groq returned content that is not valid JSON');
    });
});
