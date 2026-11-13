import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
    normalizeProvider,
    PROVIDERS,
    type ProviderConfig,
    type ProviderInput,
    type ProviderName,
} from './config/providers';

export interface LlmRequestOptions {
    provider?: ProviderInput;
    model?: string;
    maxTokens?: number;
    timeoutMs?: number;
}

interface ResolvedProvider {
    name: ProviderName;
    config: ProviderConfig;
    apiKey: string;
    model: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 2_048;

function resolveProvider(options: LlmRequestOptions): ResolvedProvider {
    const selectedName = options.provider ?? process.env.LLM_PROVIDER;
    let name: ProviderName | undefined;

    if (selectedName?.trim()) {
        name = normalizeProvider(selectedName);
        if (!name) {
            throw new Error(
                `Unsupported LLM provider "${selectedName}". Choose openrouter, groq, openai, anthropic (or claude), deepseek, or google.`,
            );
        }
    } else {
        const configuredProviders = (Object.keys(PROVIDERS) as ProviderName[]).filter(
            (provider) => (process.env[PROVIDERS[provider].apiKeyEnv] ?? '').trim().length > 0,
        );

        if (configuredProviders.length > 1) {
            throw new Error('Set LLM_PROVIDER because API keys are configured for multiple providers.');
        }
        if (configuredProviders.length === 0) {
            const keyNames = Object.values(PROVIDERS).map(({ apiKeyEnv }) => apiKeyEnv).join(', ');
            throw new Error(
                `No LLM API key is configured. Add one of these variables to .env or the process environment: ${keyNames}.`,
            );
        }
        name = configuredProviders[0];
    }

    if (!name) {
        throw new Error(
            'No LLM provider is selected. Set LLM_PROVIDER and the matching provider API key.',
        );
    }

    const config = PROVIDERS[name];
    const apiKey = (process.env[config.apiKeyEnv] ?? '').trim();
    if (!apiKey) {
        throw new Error(`Missing ${config.apiKeyEnv} for the selected ${name} provider.`);
    }

    const model = (
        options.model
        ?? process.env.LLM_MODEL
        ?? process.env[config.modelEnv]
        ?? config.defaultModel
    ).trim();
    if (!model) {
        throw new Error(`The model name for ${name} must not be empty.`);
    }

    return { name, config, apiKey, model };
}

function validatePositiveInteger(value: number, optionName: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${optionName} must be a positive integer.`);
    }
}

function getErrorDetail(body: string, apiKey: string): string {
    return body
        .replaceAll(apiKey, '[redacted]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
        .slice(0, 1_000);
}

async function postJson(
    provider: ResolvedProvider,
    prompt: string,
    maxTokens: number,
    timeoutMs: number,
): Promise<string> {
    const jsonInstruction = 'Return only valid JSON. Do not include markdown fences or commentary.';
    const headers: Record<string, string> = {
        'content-type': 'application/json',
    };
    let body: Record<string, unknown>;
    let endpoint = provider.config.endpoint;

    if (provider.config.api === 'anthropic') {
        headers['x-api-key'] = provider.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = {
            model: provider.model,
            max_tokens: maxTokens,
            system: jsonInstruction,
            messages: [{ role: 'user', content: prompt }],
        };
    } else if (provider.config.api === 'google') {
        headers['x-goog-api-key'] = provider.apiKey;
        endpoint = `${provider.config.endpoint}/${encodeURIComponent(provider.model)}:generateContent`;
        body = {
            systemInstruction: { parts: [{ text: jsonInstruction }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: maxTokens,
                responseMimeType: 'application/json',
            },
        };
    } else {
        headers.authorization = `Bearer ${provider.apiKey}`;
        if (provider.name === 'openrouter') {
            const referer = process.env.OPENROUTER_SITE_URL?.trim();
            const title = process.env.OPENROUTER_APP_NAME?.trim();
            if (referer) headers['HTTP-Referer'] = referer;
            if (title) headers['X-Title'] = title;
        }
        body = {
            model: provider.model,
            max_tokens: maxTokens,
            messages: [
                { role: 'system', content: jsonInstruction },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
        };
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
        const detail = getErrorDetail(await response.text(), provider.apiKey);
        throw new Error(
            `${provider.name} request failed with HTTP ${response.status}${detail ? `: ${detail}` : '.'}`,
        );
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') {
        throw new Error(`${provider.name} returned an invalid response payload.`);
    }

    if (provider.config.api === 'anthropic') {
        const content = (payload as { content?: unknown }).content;
        if (!Array.isArray(content)) {
            throw new Error(`${provider.name} response did not contain a content array.`);
        }
        const text = content
            .filter((item): item is { type: string; text: string } =>
                !!item
                && typeof item === 'object'
                && 'type' in item
                && item.type === 'text'
                && 'text' in item
                && typeof item.text === 'string',
            )
            .map((item) => item.text)
            .join('\n')
            .trim();
        if (!text) throw new Error(`${provider.name} returned no text content.`);
        return text;
    }

    if (provider.config.api === 'google') {
        const candidates = (payload as {
            candidates?: { content?: { parts?: { text?: unknown }[] } }[];
        }).candidates;
        const text = candidates?.[0]?.content?.parts
            ?.map((part) => part.text)
            .filter((part): part is string => typeof part === 'string')
            .join('\n')
            .trim();
        if (!text) throw new Error(`${provider.name} response did not contain text content.`);
        return text;
    }

    const choices = (payload as {
        choices?: { message?: { content?: unknown } }[];
    }).choices;
    const content = choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
        throw new Error(`${provider.name} response did not contain a text completion.`);
    }
    return content.trim();
}

function parseJson<T>(content: string, provider: ProviderName): T {
    const fenced = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const json = (fenced?.[1] ?? content).trim();
    try {
        return JSON.parse(json) as T;
    } catch (error) {
        const reason = error instanceof Error ? error.message : 'invalid JSON';
        throw new Error(`${provider} returned content that is not valid JSON: ${reason}`);
    }
}

/**
 * Sends a prompt to the selected LLM and parses its response as JSON.
 * Select a provider with LLM_PROVIDER or the request's provider option.
 */
export async function generateJson<T = unknown>(
    prompt: string,
    options: LlmRequestOptions = {},
): Promise<T> {
    if (!prompt.trim()) throw new Error('Prompt must not be empty.');

    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    validatePositiveInteger(maxTokens, 'maxTokens');
    validatePositiveInteger(timeoutMs, 'timeoutMs');

    const provider = resolveProvider(options);
    const content = await postJson(provider, prompt, maxTokens, timeoutMs);
    return parseJson<T>(content, provider.name);
}

/** Generates JSON and writes a pretty-printed copy to the requested file. */
export async function generateJsonFile<T = unknown>(
    filePath: string,
    prompt: string,
    options: LlmRequestOptions = {},
): Promise<T> {
    if (!filePath.trim()) throw new Error('Output file path must not be empty.');

    const result = await generateJson<T>(prompt, options);
    const absolutePath = path.resolve(filePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    return result;
}
