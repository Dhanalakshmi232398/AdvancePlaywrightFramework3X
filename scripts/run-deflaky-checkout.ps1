param(
    [ValidateRange(2, 100)]
    [int]$Runs = 2
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repositoryRoot

$env:PLAYWRIGHT_JSON_OUTPUT_NAME = 'test-results\deflaky-report.json'
$runStartedAtMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$playwrightCommand = 'npx playwright test --grep=should.complete.checkout.consistently.across.repeated.runs --project=chromium --retries=0 --reporter=json,./src/utils/CustomerReporter.ts'
$deflakyArguments = @(
    '--yes',
    'deflaky-cli',
    'run',
    '--command',
    $playwrightCommand,
    '--runs',
    "$Runs"
)

Write-Host "Running the checkout spec $Runs times with DeFlaky..."
& npx @deflakyArguments
$deflakyExitCode = $LASTEXITCODE

Write-Host 'Adding DeFlaky results to the latest Customer Report...'
& node .\scripts\attach-deflaky-data-to-customer-report.cjs $runStartedAtMs
$integrationExitCode = $LASTEXITCODE

if ($integrationExitCode -ne 0) {
    exit $integrationExitCode
}

exit $deflakyExitCode
