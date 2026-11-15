# Run the checkout spec with DeFlaky

This runbook shows how to run
[`e2e-checkout-flaky.spec.ts`](../../src/tests/ai/e2e-checkout-flaky.spec.ts)
twice with DeFlaky, add its aggregate results to the Customer Report's Flaky
tab, interpret the comparison, and open the local DeFlaky dashboard.
Commands are written for PowerShell on Windows and should be run from the
repository root (the folder containing `playwright.config.ts`).

## What this run checks

The spec performs the normal checkout flow: it signs in, adds an item, enters
checkout details, and verifies the order confirmation. DeFlaky starts the
Playwright command repeatedly and compares the result for each test across
those runs.

This is a repeatability check, not a test that deliberately creates
intermittent failures. A test that fails in every iteration is consistently
failing, not flaky. Two iterations are useful for a quick check, but provide
only a small sample; increase the run count when you need more confidence.

## Prerequisites

- Node.js and npm are installed.
- Project dependencies are installed.
- Playwright's Chromium browser is installed. If it is not, install it once:

  ```powershell
  npx playwright install chromium
  ```

- The configured checkout application and test account are available. The
  Playwright config loads `.env` and selects the base URL using `BASE_URL`,
  `TTA_ENV`, and the corresponding environment-specific URL variable. Keep
  credentials and API keys in the local environment; do not paste them into
  this guide or into command history.
- The terminal is at the repository root. Check it with:

  ```powershell
  Get-Location
  Test-Path .\playwright.config.ts
  ```

  The second command should return `True`.

DeFlaky is invoked with `npx`, so a global installation is not required.
`--yes` allows `npx` to use the `deflaky-cli` package without asking for an
installation confirmation.

## Run the spec twice

Run the repo script from a PowerShell terminal at the repository root:

```powershell
.\scripts\run-deflaky-checkout.ps1
```

The script defaults to two DeFlaky runs. To run five iterations instead:

```powershell
.\scripts\run-deflaky-checkout.ps1 -Runs 5
```

### What the script does

1. Sets `PLAYWRIGHT_JSON_OUTPUT_NAME` to
   `test-results\deflaky-report.json` so DeFlaky can find Playwright's
   machine-readable results.
2. Selects the checkout repeatability test by its unique title and runs it in
   the `chromium` project.
3. Explicitly sets Playwright `--retries=0`. DeFlaky owns the repeat count, so
   each iteration reports its own outcome without Playwright retries masking
   a pass/fail difference.
4. Uses both the JSON reporter and `CustomerReporter`. The JSON report is used
   by DeFlaky; the Customer Reporter writes the normal TTA HTML report during
   each iteration.
5. After DeFlaky finishes, reads the newly generated `.deflaky\last-run.json`
   summary and adds its FlakeScore, run count, stable/flaky/failing counts,
   and per-test pass/fail details to the **Flaky** tab in the latest TTA
   report.
6. Keeps DeFlaky's exit code. If result integration fails, the script reports
   that error instead of silently claiming the Customer Report was updated.

The report update only uses a DeFlaky summary created during this invocation.
It refuses to attach an old `.deflaky\last-run.json` or update a report from a
previous test run.

### DeFlaky iterations are not separate CI builds

`--runs 2` starts the Playwright command twice in one DeFlaky invocation. This
is a repeat-run comparison, not a comparison of two separate CI pipeline
builds. The report labels the information as **DeFlaky repeated-run results**
so it is distinct from any future build-to-build comparison in the Flaky tab.
The runner sets `--retries=0` even if `CI` is set, keeping each DeFlaky
iteration's outcome observable.

## Check that results were produced

The run should finish with DeFlaky's test totals and FlakeScore. Confirm that
the expected output files exist:

```powershell
Test-Path .\test-results\deflaky-report.json
Test-Path .\.deflaky\last-run.json
Get-ChildItem .\tta-report\report_*.html | Sort-Object LastWriteTime -Descending | Select-Object -First 1 FullName, LastWriteTime
```

The first two commands should return `True`. The third shows the newest TTA
report. Open it to see the **Flaky** tab with DeFlaky's run summary. The
generated files have different purposes:

- `test-results\deflaky-report.json` is the Playwright JSON report that
  DeFlaky reads.
- `.deflaky\last-run.json` is DeFlaky's summary for the most recent run. The
  local dashboard and the Customer Report integration use this result.
- `tta-report\report_<timestamp>.html` is the self-contained TTA report. The
  run script adds DeFlaky data to its Flaky tab after the repeated runs finish.

To inspect the JSON files in PowerShell:

```powershell
Get-Content .\.deflaky\last-run.json
Get-Content .\test-results\deflaky-report.json -TotalCount 40
```

The Playwright report can be large. The second command shows only its first
40 lines; use an editor or JSON viewer if you need to inspect more.

## Understand the result

| Result | Meaning |
| --- | --- |
| Stable | The test produced a consistent outcome across the DeFlaky iterations. |
| Flaky | The test had different outcomes across iterations, such as a pass in one run and a failure in another. |
| Failing | The test failed consistently. Investigate the failure; a consistent failure is not, by itself, evidence of flakiness. |
| FlakeScore | A summary percentage. Read it together with the stable, flaky, and failing counts; the score alone does not explain the outcomes. |

For this one-test spec, two successful iterations should report one stable
test, zero flaky tests, zero failing tests, and a 100% FlakeScore. That only
means the test was consistent in this sample; it does not prove that the test
will never be flaky. If both iterations fail in the same way, inspect the
failure instead of treating a high consistency score as a passing test.

For a larger sample, use the script's `-Runs` parameter as shown above. More
iterations take longer and may repeat checkout activity against the configured
environment.

## Open the local dashboard

After DeFlaky has completed, open a **second** PowerShell terminal at the
repository root and start the viewer:

```powershell
npx --yes deflaky-cli serve --port 3333
```

Leave that terminal running and open
[http://127.0.0.1:3333](http://127.0.0.1:3333) in a browser. The dashboard
shows the most recent local DeFlaky summary from `.deflaky\last-run.json`.
After another DeFlaky run, refresh the page to see the updated summary.

To check that the local server responds, use another terminal:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3333
```

Stop the server with `Ctrl+C` in the terminal running `serve`. If port 3333 is
already occupied, start the viewer on another port and use the matching URL:

```powershell
npx --yes deflaky-cli serve --port 3334
```

Then open [http://127.0.0.1:3334](http://127.0.0.1:3334).

## Troubleshooting

### DeFlaky reports `Total tests: 0`

DeFlaky did not find a supported test report. Check all of the following:

1. Run the command from the repository root.
2. Set `$env:PLAYWRIGHT_JSON_OUTPUT_NAME` in the same PowerShell terminal
   before launching DeFlaky.
3. Keep `--reporter=json` in the Playwright command.
4. Confirm `test-results\deflaky-report.json` exists and has a recent modified
   time after the command finishes.

If the file is absent or was not updated, first run the Playwright portion
directly to see its error:

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = 'test-results\deflaky-report.json'
npx playwright test --grep "should complete checkout consistently across repeated runs" --project=chromium --retries=0 --reporter=json,./src/utils/CustomerReporter.ts
```

Resolve any Playwright failure, then rerun
`.\scripts\run-deflaky-checkout.ps1` to generate both the aggregate data and
the updated Customer Report.

### The test fails before checkout starts

Check that the configured application is reachable and that the required test
account/configuration is available. The Playwright config defaults to the QA
environment unless `TTA_ENV` or `BASE_URL` selects another environment. Do
not add secrets to the command or report when asking for help.

### Playwright cannot launch Chromium

Install the project's Chromium browser:

```powershell
npx playwright install chromium
```

Then rerun the DeFlaky command.

### The dashboard does not open

Make sure the `serve` command is still running. If it exited because the port
was occupied, start it on a different port, such as `3334`, and use that port
in the browser URL. If the page loads but has no latest result, run DeFlaky
successfully first and confirm `.deflaky\last-run.json` exists.

### Results show failures in both iterations

This is a consistent failure, not a pass/fail fluctuation. Review the
Playwright output and the test failure before drawing a conclusion about
flakiness. If the outcomes differ between iterations, use the test name and
failure details to identify the intermittent step.

## Keep results local

The commands in this guide do not include `--push` and do not require a
DeFlaky dashboard token. The results are written to the local workspace and
the dashboard is served from `127.0.0.1`; no hosted dashboard upload is
performed.

## Previously verified run

On November 15, 2026, this spec completed twice with one stable test, zero
flaky tests, zero failing tests, and a 100% FlakeScore. This is a record of
that run, not a promise about later runs; application state and test behavior
can change.
