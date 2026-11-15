# AI layer

This folder contains a provider-agnostic LLM gateway and agents that build on
the existing Playwright framework. The current agent design separates provider
plumbing from agent behavior:

1. A prompt explains one task and supplies the relevant input.
2. An AJV JSON schema defines the response contract.
3. `agents/agentFactory.ts` sends the prompt through `llmGateway.ts` and
   validates the parsed JSON against that schema.
4. A utility, Playwright fixture, or reporter calls the agent and presents its
   result.

Adding another prompt-and-schema agent should not require new provider
integration code.

## LLM providers

Set `LLM_PROVIDER` to one of `openrouter`, `groq`, `openai`, `anthropic`
(`claude` is also accepted), `deepseek`, or `google`, then set the matching API
key:

| Provider | API key | Optional model override |
| --- | --- | --- |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` |
| Groq | `GROQ_API_KEY` | `GROQ_MODEL` |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` |
| Anthropic / Claude | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` |
| Google Gemini | `GOOGLE_API_KEY` | `GOOGLE_MODEL` |

`LLM_MODEL` can override the selected provider's default model. If multiple
provider keys are configured, set `LLM_PROVIDER` explicitly. The gateway does
not silently switch providers. Keep keys in the ignored local `.env` file or a
secrets manager; never commit them.

## Agent inventory

### 1. Test-data agent

- **Implementation:** `agents/testDataAgent.ts`
- **Prompt:** `prompts/checkoutCustomer.prompt.md`, loaded by
  `prompts/checkoutCustomer.ts`
- **Output:** JSON containing fictional checkout customer data.
- **Schema and validation:** The factory validates that the response is a JSON
  object. `utils/DataGenerator.ts` then normalizes nested/aliased provider
  fields and strictly validates the first name, last name, and five-digit
  postal code.
- **Integration:** `DataGenerator.checkoutCustomerFromAIWithSource()` calls
  the agent. AI-generated datasets can be attached as `ai-data` for the
  Customer Report's AI Data tab.
- **No-key behavior:** Uses Faker and marks the source as `faker`. Provider
  errors or invalid generated data are surfaced rather than silently replaced.

### 2. Root-cause-analysis (RCA) agent

- **Implementation:** `agents/rcaAgent.ts`
- **Prompt:** `prompts/rca.prompt.md`, loaded and assembled by
  `prompts/rootCause.ts`
- **Output schema:** `RcaVerdict` requires a root cause, severity, priority,
  and actionable fixes.
- **Integration:** `CustomerReporter` runs `analyzeFailure()` for failed or
  timed-out tests and displays the result in AI Verdict.
- **No-key behavior:** If no provider is selected and no provider key is
  configured, uses a labeled heuristic analysis. Otherwise, provider and
  schema errors are surfaced.

### 3. Self-heal locator agent

- **Implementation:** `agents/selfHealAgent.ts`
- **Prompt:** `prompts/selfHeal.prompt.md`, loaded and assembled by
  `prompts/selfHeal.ts`
- **Output schema:** Up to three locator suggestions; each includes a selector
  expression, locator strategy, and evidence-based reasoning.
- **Capture and integration:** The automatic locator-failure fixture in
  `fixtures/test-base.ts` detects locator-related test errors, captures a
  bounded page DOM snapshot and a screenshot, and invokes the agent. The
  snapshot includes relevant DOM attributes and labels, but not input values;
  it is sent through the configured LLM gateway. The screenshot remains a
  local Customer Report attachment. Suggestions appear in the Self-Heal tab.
- **Safety:** Suggestions are advisory only. The agent does not execute them,
  modify locators, or rewrite tests. Without an active provider key, the report
  says the agent is unavailable instead of inventing a suggestion.

Run the checkout demonstration from the repository root:

```powershell
npx playwright test --grep "suggests a replacement for a broken checkout locator" --project=chromium
```

The test completes checkout, then deliberately uses a missing post-confirmation
locator to exercise capture and reporting. That final locator failure is
intentional, so the command exits with a failure. Configure a supported
`LLM_PROVIDER` and matching key to receive model-generated suggestions.

### 4. Flaky-test analyzer

- **Implementation:** `agents/flakyAnalyzer.ts`
- **Current behavior:** `analyzeFlaky()` compares per-test statuses from two
  build summaries. It counts tests that changed between pass and fail as flaky
  and tests that failed in both as consistently failing.
- **Important status:** This is currently deterministic comparison logic, not
  an LLM-backed prompt-and-schema agent. It has no prompt or output schema and
  is not yet connected to the Customer Report's build-comparison data flow.
  LLM-generated flaky summaries and report integration remain future work.

## How the factory works

`AgentDefinition<Input, Output>` in `agents/agentFactory.ts` takes:

- an agent name, used in validation errors;
- a prompt function that turns typed input into a prompt string; and
- an AJV `JSONSchemaType<Output>` response schema.

`createAgent()` compiles the schema once. Each `run(input)` builds the prompt,
calls `generateJson()` from `llmGateway.ts`, and throws a named error if the
provider's JSON does not match the schema.

For example, the RCA and Self-Heal agents follow this pattern:

```ts
const agent = createAgent<Input, Output>({
    name: 'example agent',
    prompt: buildPrompt,
    schema: outputSchema,
});

const result = await agent.run(input);
```

Prompt markdown files are kept in `prompts/*.prompt.md`; small TypeScript
wrappers load the file and append bounded, structured runtime input. Agent
schemas stay next to their agent implementations.

To add another factory-backed agent:

1. Add a focused `*.prompt.md` file under `prompts/`.
2. Add a TypeScript prompt wrapper that loads it and serializes only the
   required, bounded input.
3. Define typed input/output interfaces and an AJV `JSONSchemaType` in a new
   file under `agents/`.
4. Create the agent with `createAgent()` and add the smallest integration point
   needed by the framework.
5. Add a mocked-provider test that checks prompt input and schema validation;
   do not require a live API key in unit tests.

## Other LLM-assisted utility

`DataGenerator.transferNoteFromAI()` calls `generateJson()` directly with
`prompts/transferNote.ts` and validates the note length. This is an LLM-backed
utility, but it is not currently an `agentFactory` agent.

## Tests

Run the gateway and agent tests with:

```powershell
npx playwright test --grep "LLM gateway" --project=chromium --reporter=line
```

The tests mock provider HTTP responses, so they do not need a real API key.
When available, type-check the project with:

```powershell
tsc --noEmit --pretty false
```
