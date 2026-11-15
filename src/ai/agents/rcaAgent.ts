/**
 * Root Cause Analysis agent.
 */

import type { JSONSchemaType } from 'ajv';
import { createAgent } from './agentFactory';
import { PROVIDERS } from '../config/providers';
import { rootCausePrompt } from '../prompts/rootCause';

export interface RcaVerdict {
    rootCause: string;
    severity: 'low' | 'medium' | 'high';
    priority: 'P0' | 'P1' | 'P2' | 'P3';
    fixes: string[];
}

export interface FailureInput {
    title: string;
    file: string;
    error: string;
    stack?: string;
}

export interface FailureAnalysis {
    source: 'llm' | 'heuristic';
    verdict: RcaVerdict;
}

const rcaSchema: JSONSchemaType<RcaVerdict> = {
    type: 'object',
    properties: {
        rootCause: { type: 'string', minLength: 1 },
        severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
        fixes: { type: 'array', items: { type: 'string', minLength: 1 } },
    },
    required: ['rootCause', 'severity', 'priority', 'fixes'],
    additionalProperties: false,
};

const rcaAgent = createAgent<FailureInput, RcaVerdict>({
    name: 'RCA agent',
    prompt: rootCausePrompt,
    schema: rcaSchema,
});

function heuristicVerdict(input: FailureInput): RcaVerdict {
    const err = input.error.toLowerCase();

    if (err.includes('strict mode violation')) {
        return {
            rootCause: 'The locator matched more than one element.',
            severity: 'medium',
            priority: 'P2',
            fixes: ['Narrow the selector', 'Use .filter({ hasText })', 'Use .first() if order is stable'],
        };
    }
    if (err.includes('timeout') || err.includes('exceeded')) {
        return {
            rootCause: 'The element or navigation did not settle within the timeout.',
            severity: 'high',
            priority: 'P1',
            fixes: ['Assert with a retrying expect()', 'Raise the timeout', 'Check the waitUntil state'],
        };
    }
    return {
        rootCause: input.error.split('\n')[0] || 'Unknown failure.',
        severity: 'medium',
        priority: 'P2',
        fixes: ['Open the trace to inspect the failing action'],
    };
}

function hasConfiguredProvider(): boolean {
    return Object.values(PROVIDERS).some(
        ({ apiKeyEnv }) => (process.env[apiKeyEnv] ?? '').trim().length > 0,
    );
}

export async function analyzeFailure(input: FailureInput): Promise<FailureAnalysis> {
    if (!process.env.LLM_PROVIDER?.trim() && !hasConfiguredProvider()) {
        return { source: 'heuristic', verdict: heuristicVerdict(input) };
    }

    return { source: 'llm', verdict: await rcaAgent.run(input) };
}