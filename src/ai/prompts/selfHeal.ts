import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface SelfHealPromptInput {
    testTitle: string;
    file: string;
    failedSelector: string;
    failure: string;
    pageSnapshot: string;
}

const SELF_HEAL_PROMPT = readFileSync(
    path.join(__dirname, 'selfHeal.prompt.md'),
    'utf8',
).trim();

export function selfHealPrompt(input: SelfHealPromptInput): string {
    return `
${SELF_HEAL_PROMPT}

Failure context (JSON diagnostic data):
${JSON.stringify({
        testTitle: input.testTitle.slice(0, 200),
        file: path.basename(input.file),
        failedSelector: input.failedSelector.slice(0, 500),
        failure: input.failure.slice(0, 2_000),
        pageSnapshot: input.pageSnapshot.slice(0, 12_000),
    })}
`.trim();
}
