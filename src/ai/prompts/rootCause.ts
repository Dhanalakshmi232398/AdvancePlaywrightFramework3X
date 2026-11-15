import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface RootCausePromptInput {
    title: string;
    file: string;
    error: string;
}

const ROOT_CAUSE_PROMPT = readFileSync(
    path.join(__dirname, 'rca.prompt.md'),
    'utf8',
).trim();

export function rootCausePrompt(input: RootCausePromptInput): string {
    return `
${ROOT_CAUSE_PROMPT}

Failure details:
${JSON.stringify({
        title: input.title,
        file: path.basename(input.file),
        error: input.error.slice(0, 4_000),
    })}
`.trim();
}
