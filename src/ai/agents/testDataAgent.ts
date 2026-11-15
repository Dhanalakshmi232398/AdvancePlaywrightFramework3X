import type { JSONSchemaType } from 'ajv';
import { createAgent } from './agentFactory';
import { CHECKOUT_CUSTOMER_PROMPT } from '../prompts/checkoutCustomer';

export type TestDataResponse = Record<string, unknown>;

const responseSchema: JSONSchemaType<TestDataResponse> = {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: true,
};

export const testDataAgent = createAgent<void, TestDataResponse>({
    name: 'test data agent',
    prompt: () => CHECKOUT_CUSTOMER_PROMPT,
    schema: responseSchema,
});
