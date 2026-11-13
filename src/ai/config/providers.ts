export type ProviderName = 'openrouter' | 'groq' | 'openai' | 'anthropic' | 'deepseek' | 'google';
export type ProviderInput = ProviderName | 'claude';

export interface ProviderConfig {
    apiKeyEnv: string;
    modelEnv: string;
    defaultModel: string;
    endpoint: string;
    api: 'openai-compatible' | 'anthropic' | 'google';
}

export const PROVIDERS: Record<ProviderName, ProviderConfig> = {
    openrouter: {
        apiKeyEnv: 'OPENROUTER_API_KEY',
        modelEnv: 'OPENROUTER_MODEL',
        defaultModel: 'openai/gpt-4o-mini',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        api: 'openai-compatible',
    },
    groq: {
        apiKeyEnv: 'GROQ_API_KEY',
        modelEnv: 'GROQ_MODEL',
        defaultModel: 'llama-3.3-70b-versatile',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        api: 'openai-compatible',
    },
    openai: {
        apiKeyEnv: 'OPENAI_API_KEY',
        modelEnv: 'OPENAI_MODEL',
        defaultModel: 'gpt-4o-mini',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        api: 'openai-compatible',
    },
    anthropic: {
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        modelEnv: 'ANTHROPIC_MODEL',
        defaultModel: 'claude-3-5-haiku-latest',
        endpoint: 'https://api.anthropic.com/v1/messages',
        api: 'anthropic',
    },
    deepseek: {
        apiKeyEnv: 'DEEPSEEK_API_KEY',
        modelEnv: 'DEEPSEEK_MODEL',
        defaultModel: 'deepseek-chat',
        endpoint: 'https://api.deepseek.com/chat/completions',
        api: 'openai-compatible',
    },
    google: {
        apiKeyEnv: 'GOOGLE_API_KEY',
        modelEnv: 'GOOGLE_MODEL',
        defaultModel: 'gemini-2.0-flash',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        api: 'google',
    },
};

const providerNames = Object.keys(PROVIDERS) as ProviderName[];

export function normalizeProvider(value: string): ProviderName | undefined {
    const name = value.trim().toLowerCase();
    if (name === 'claude') return 'anthropic';
    return providerNames.find((provider) => provider === name);
}

export function activeProvider(): ProviderName | undefined {
    const configuredProvider = process.env.LLM_PROVIDER?.trim();
    if (configuredProvider) return normalizeProvider(configuredProvider);

    const configuredKeys = providerNames.filter(
        (provider) => (process.env[PROVIDERS[provider].apiKeyEnv] ?? '').trim().length > 0,
    );
    return configuredKeys.length === 1 ? configuredKeys[0] : undefined;
}

export function hasApiKey(): boolean {
    const provider = activeProvider();
    return provider !== undefined
        && (process.env[PROVIDERS[provider].apiKeyEnv] ?? '').trim().length > 0;
}
