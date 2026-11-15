# Playwright AI-agent architecture plan

## Goal

Use the existing provider-agnostic `src/ai/llmGateway.ts` as the only provider
transport. Build agents from a prompt and a runtime-validated output schema so
new agents do not add provider-specific plumbing. Support four capabilities:

1. AI test-data generation
2. Failure root-cause analysis (RCA)
3. Flaky-test analysis
4. Self-healing locator suggestions

The supplied folder-structure reference is reflected in `src/ai/agents/`,
`src/ai/prompts/`, and `src/tests/ai/`.

## Target structure

```text
src/ai/
  llmGateway.ts
  config/providers.ts
  agents/
    agentFactory.ts
    testDataAgent.ts
    rcaAgent.ts
    flakyAnalyzer.ts
    selfHealAgent.ts
  prompts/
    checkoutCustomer.prompt.md
    rca.prompt.md
    flaky.prompt.md
    selfHeal.prompt.md
src/utils/
  DataGenerator.ts
  CustomerReporter.ts
  selfHeal.ts
src/tests/ai/
  llmGateway.spec.ts
  e2e-checkout_validFixture_DataGenAI.spec.ts
  e2e-checkout-failure.spec.ts
```

`agentFactory.ts` receives a prompt function and an AJV JSON schema. It calls
`generateJson`, validates the parsed response, and returns a typed result.
Provider configuration, authentication, retries/timeouts, and response parsing
remain in the gateway.

## Phases

### 1. Shared gateway and agent factory

- Keep provider selection and HTTP details in `llmGateway.ts`.
- Expose one reusable `createAgent<Input, Output>()` API in
  `src/ai/agents/agentFactory.ts`.
- Require each agent to provide its prompt and `JSONSchemaType<Output>`.
- Reject schema-invalid output explicitly; never cast or silently accept it.

### 2. Test-data and RCA agents

- Implement `testDataAgent.ts` with the checkout prompt and an output schema.
- Keep field-level customer validation and historical nested/aliased response
  support in `DataGenerator.ts`.
- Attach generated customer data as `ai-data` JSON for the custom reporter.
  Include the source (`ai` or `faker`) so a no-key fallback is not mislabeled.
- Implement `rcaAgent.ts` as a prompt/schema agent. On failed tests,
  `CustomerReporter` runs the analysis and renders its result in AI Verdict.
- With no provider credentials, label the existing rule-based RCA fallback.
  If a configured provider call fails, show the analysis error in the report.
- Keep an expected-failure checkout spec to verify one failure in the report
  without making the Playwright command fail.

### 3. Flaky-test agent

- Preserve the current deterministic comparison of consecutive build statuses.
- Add an optional prompt/schema agent for explaining detected flips and
  summarizing likely causes.
- Store only the minimum test title/status history needed for comparison.
- Keep the Flaky report tab useful when the LLM is not configured.

### 4. Self-heal agent

- Reuse the current locator candidate discovery and `HealReport` shape.
- Add a prompt/schema agent only for ranking or explaining candidates derived
  from the live accessibility tree.
- Verify every proposed locator against the live page (unique match and
  visibility) before reporting it.
- Never silently rewrite selectors or retry unsafe actions; keep suggestions
  reviewable in the Self-Heal tab.

### 5. Verification and rollout

- Unit-test gateway provider adapters and agent schema validation with mocked
  `fetch`; do not require live LLM credentials for unit tests.
- Test each no-key path and verify the report labels fallback behavior.
- Run a passing checkout flow and a marked expected-failure flow; verify AI
  Data and AI Verdict content in the generated custom report.
- Run Flaky and Self-Heal checks against representative histories/pages before
  enabling them by default.
- Keep credentials in ignored environment configuration; do not include
  credentials, stack traces, or unnecessary page data in prompts.

## Current implementation state

- Existing: provider configuration, gateway, `flakyAnalyzer.ts`, Self-Heal
  report shape/utilities, and custom report tabs.
- Added: schema-validating agent factory, test-data and RCA agent modules,
  Markdown checkout/RCA prompts, AI-data attachment, failure RCA reporting,
  and an expected-failure checkout spec.
- Remaining: LLM-backed flaky summaries and a prompt/schema-backed self-heal
  agent. These are isolated follow-up phases and should reuse the same factory.
