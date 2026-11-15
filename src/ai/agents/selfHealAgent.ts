import type { JSONSchemaType } from 'ajv';
import { createAgent } from './agentFactory';
import { hasApiKey } from '../config/providers';
import { selfHealPrompt, type SelfHealPromptInput } from '../prompts/selfHeal';
import type { HealReport, HealSuggestion } from '../../utils/selfHeal';

export interface LocatorFailureInput extends SelfHealPromptInput {
    intent: string;
}

interface SelfHealResponse {
    suggestions: HealSuggestion[];
}

const selfHealSchema: JSONSchemaType<SelfHealResponse> = {
    type: 'object',
    properties: {
        suggestions: {
            type: 'array',
            maxItems: 3,
            items: {
                type: 'object',
                properties: {
                    selector: { type: 'string', minLength: 1 },
                    strategy: {
                        type: 'string',
                        enum: ['role', 'label', 'placeholder', 'testid', 'text', 'css'],
                    },
                    reasoning: { type: 'string', minLength: 1 },
                },
                required: ['selector', 'strategy', 'reasoning'],
                additionalProperties: false,
            },
        },
    },
    required: ['suggestions'],
    additionalProperties: false,
};

const selfHealAgent = createAgent<LocatorFailureInput, SelfHealResponse>({
    name: 'Self-Heal agent',
    prompt: selfHealPrompt,
    schema: selfHealSchema,
});

export async function analyzeLocatorFailure(input: LocatorFailureInput): Promise<HealReport> {
    const report: HealReport = {
        failedSelector: input.failedSelector,
        intent: input.intent,
        verified: [],
        rejected: [],
        suggestions: [],
    };

    if (!hasApiKey()) {
        report.unavailableReason = 'No active LLM provider API key is configured; no locator suggestions were generated.';
        return report;
    }

    const response = await selfHealAgent.run(input);
    report.suggestions = response.suggestions;
    return report;
}
