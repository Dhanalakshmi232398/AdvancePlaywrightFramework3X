# LLM gateway

`llmGateway.ts` sends a prompt to one explicitly selected provider and parses
the completion as JSON. It supports OpenRouter, Groq, OpenAI, Anthropic/Claude,
DeepSeek, and Google Gemini. OpenRouter, Groq, OpenAI, and DeepSeek use their
OpenAI-compatible chat-completions API; Anthropic uses its Messages API.

Set `LLM_PROVIDER` to `openrouter`, `groq`, `openai`, `anthropic` (or `claude`),
or `deepseek`, and set the matching API key:

| Provider | API key | Optional model override |
| --- | --- | --- |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` |
| Groq | `GROQ_API_KEY` | `GROQ_MODEL` |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` |
| Anthropic / Claude | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` |
| Google Gemini | `GOOGLE_API_KEY` | `GOOGLE_MODEL` |

`LLM_MODEL` can override the model for the selected provider. The gateway uses
a provider-specific default model if none is supplied. Model names, availability,
free quotas, and pricing can change; not all providers or models are free.
Provider selection never falls back to another service. If keys for multiple
providers are set, `LLM_PROVIDER` is required.

```ts
import { generateJson, generateJsonFile } from './llmGateway';
import { DataGenerator } from '../utils/DataGenerator';

const result = await generateJson<{ summary: string }>(
    'Summarize this test failure as JSON with a summary field.',
);

await generateJsonFile(
    'artifacts/failure-summary.json',
    'Summarize this test failure as JSON with a summary field.',
);

const checkoutCustomer = await DataGenerator.checkoutCustomerFromAI();
```

Keep API keys in the ignored local `.env` file or a secrets manager; never
commit them. Only send prompts to providers approved by your organization.
If `checkoutCustomerFromAI()` has no key for its selected provider, it logs a
warning and returns Faker-generated data. Provider/API errors and invalid
responses still fail the test.
