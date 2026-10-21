# Advance Playwright Framework 3X

An end-to-end test automation framework built on [Playwright](https://playwright.dev/) and TypeScript, using the Page Object Model, data-driven readers for CSV/YAML/Excel/MySQL, and a custom HTML reporter ("TTA report") that adds self-heal, flaky and AI-analysis tabs on top of the standard Playwright report.

Target application for the example specs: `https://app.thetestingacademy.com/playwright/ttacart/`.

## Requirements

- Node.js 18+ (CI runs the current LTS)
- npm
- Optional: MySQL if you want to use the database reader

## Setup

```bash
npm install
npx playwright install --with-deps
```

Create your local env file from the template and fill in the values:

```bash
cp .env.example .env
```

`.env` is gitignored — keep credentials out of the repo.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `TTA_ENV` | Target environment: `qa`, `stg`, `prod`, `dev`, `api` |
| `BASE_URL` | Overrides the environment-specific URL entirely |
| `QA_BASE_URL`, `STG_BASE_URL`, `PROD_BASE_URL`, `DEV_BASE_URL`, `API_BASE_URL` | Per-environment URLs |
| `LOG_LEVEL` | Logger verbosity |
| `TEST_ENV` | Shown in the TTA report header |
| `TEST_AUTHOR` | Shown in the report's Author column |
| `USERNAME`, `PASSWORD` | Login credentials for the example specs |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` | Optional; enables the report's AI tabs |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | Optional; MySQL data-driven tests |

`playwright.config.ts` loads `.env` via `dotenv`, then resolves `baseURL` as: `BASE_URL` if set, otherwise the variable for `TTA_ENV` (defaulting to `qa`).

## Running tests

`package.json` intentionally defines no npm scripts, so drive Playwright directly:

```bash
npx playwright test                 # full suite, all browsers in the config
npx playwright test tests/example.spec.ts
npx playwright test --project=chromium
npx playwright test --headed
npx playwright test --grep @smoke   # tag filters
npx playwright show-report
```

Type-check the whole project without emitting output:

```bash
npx -y -p typescript@5.9 tsc --noEmit -p .
```

## Project structure

```
src/
  ai/
    agents/          flakyAnalyzer, rcaAgent
    config/          LLM provider selection (reads API keys)
  pages/             Page objects: LoginPage, InventoryPage, CartPage
  tests/             login.spec.ts (see Known issues)
  utils/
    CustomerReporter.ts   Custom TTA HTML reporter
    selfHeal.ts           HealReport/HealCandidate types
    stepScreenshot.ts     shot() helper for per-step screenshots
    csvReader.ts          CSV -> objects (sync)
    yamlReader.ts         YAML -> LoginRow[] (sync)
    excelReader.ts        XLSX -> objects (async, exceljs)
    dbReadter.ts          MySQL reader (async, mysql2)
    generateExcel.js      Script that writes test-data/login-data.xlsx
tests/                 Playwright's testDir
docs/  rules/          Reserved, currently empty
learnings/             Post-mortem notes
```

`src/config`, `src/fixtures`, `src/api` and `src/testdata` are placeholder directories and currently contain no files.

## Page objects

Page objects live in `src/pages` and encapsulate locators plus actions.

A detail worth knowing: the TTACart app tags elements with `data-test`, **not** Playwright's default `data-testid`. The page objects own that difference with a local helper rather than forcing every spec to declare `test.use({ testIdAttribute: 'data-test' })`:

```ts
const byTest = (id: string) => page.locator(`[data-test="${id}"]`);
this.title = byTest('title');
```

Login and the inventory/cart flows are demonstrated in the page objects; the login spec asserts the destination title (`TTACart - Products`) rather than the login page title, since asserting the current page can pass before the click-triggered navigation settles.

## The TTA report

`src/utils/CustomerReporter.ts` is registered as the third reporter in `playwright.config.ts` alongside `line` and `html`. It writes to `tta-report/`:

- `report_<runId>.html` — one report per run
- `index.html` — redirects to the latest run
- `history.html` — index of all previous runs
- `screenshots/`, `videos/`, `traces/` — media copied out of Playwright's output

The report refreshes itself in real time during a run (it injects a 5-second meta refresh) and finishes with per-test steps, console logs, errors, screenshots, video and trace links. Auto-collapsed failed tests expand themselves on load.

Beyond the results table, it renders four extra tabs, each fed by a test attachment:

| Tab | Source attachment | Notes |
| --- | --- | --- |
| Self-Heal | `self-heal` (`application/json`) | Verified and rejected locator candidates; suggestions only, nothing is rewritten automatically |
| Flaky | computed from two builds | Needs a previous run to diff against |
| AI Verdict | `ai-data` + failures | RCA verdict cards with severity, priority and suggested fixes |
| AI Data | `ai-data` (`application/json`) | Pretty-printed AI-generated datasets |

Because the reporter copies media into `tta-report/`, `screenshot`/`video`/`trace` are set to `'on'` in the config. For a real suite, switch these to `'only-on-failure'` and add `/tta-report/` to `.gitignore` (it is already ignored here) so runs do not accumulate large artifacts.

Attach a screenshot to a specific step so it appears as a thumbnail beside that step:

```ts
import { shot } from '../utils/stepScreenshot';

await test.step('open the cart', async () => {
    await inventoryPage.openCart();
    await shot(page, 3, 'cart'); // index must match the step's 0-based position
});
```

The attachment name `step-<index>-<name>` is the contract the reporter matches on.

## Data-driven testing

All readers map onto the shared `LoginRow` shape (`description`, `username`, `password`, `shouldPass`, `expectedError`).

```ts
import { readYAML } from '../utils/yamlReader';
import { readCSV } from '../utils/csvReader';
import { readLoginDataFromExcel } from '../utils/excelReader';

const rows = readYAML<LoginRow>('src/testdata/login-data.yaml'); // sync, usable at collection time
```

- `readYAML` and `readCSV` are synchronous on purpose, so one `test()` can be generated per row at collection time.
- `readExcel` is async because `exceljs` is; it expects a header row and returns objects keyed by those headers.
- `dbReadter.ts` reads a `login_data` table and needs the optional `mysql2` package, which is **not** declared in `package.json` — install it (`npm i -D mysql2`) before using the DB reader. Its module specifier is kept dynamic so TypeScript does not require `mysql2`'s types at compile time.

## AI features

AI behaviour is entirely opt-in and gated on `hasApiKey()` in `src/ai/config/providers.ts`. With no key set, the report still renders in full and simply skips the AI sections.

- `src/ai/agents/flakyAnalyzer.ts` diffs per-test statuses between the current and previous build. A test that flipped pass/fail is flaky; one that failed in both builds is genuinely failing.
- `src/ai/agents/rcaAgent.ts` is currently a heuristic stub that classifies the error text (strict-mode violation, timeout, otherwise a generic verdict). Swap the body of `analyzeFailure()` for a real LLM call when a key is wired up.

## CI

`.github/workflows/playwright.yml` runs on pushes and pull requests to `main`/`master`: installs dependencies, installs browsers with `--with-deps`, runs `npx playwright test`, and uploads `playwright-report/` as an artifact.

On CI the config forces `headless: true`, `retries: 2` and `workers: 1`. Locally it runs headed and maximized in Chromium. Only Chromium is enabled; Firefox, WebKit and the mobile/branded-browser projects are commented out in `playwright.config.ts`.

## Known issues

- `playwright.config.ts` sets `testDir: './tests'`, so `src/tests/login.spec.ts` sits outside the test directory and will not be picked up by a plain `npx playwright test`. Either move it under `tests/` or widen `testDir`.
- `src/utils/dbReadter.ts` is misspelled (extra `t`) and is referenced as `src/utils/dbReader.ts` in `.env.example`.
- Several dependencies in `package.json` (`allure-playwright`, `csv-parse`, `jsonpath-plus`, `ajv`, `ajv-formats`, `xlsx`, `winston`, `@faker-js/faker`) are not imported anywhere yet; the readers currently use `fs` and `js-yaml` directly.

## Credits

Custom reporter and framework styling by [Pramod Dutta](https://thetestingacademy.com) / [The Testing Academy](https://thetestingacademy.com).
