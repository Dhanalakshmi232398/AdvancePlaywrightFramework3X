const fs = require('node:fs');
const path = require('node:path');

const rootDirectory = path.resolve(__dirname, '..');
const deflakySummaryPath = path.join(rootDirectory, '.deflaky', 'last-run.json');
const customerReportDirectory = path.join(rootDirectory, 'tta-report');

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function requireCount(value, label) {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`DeFlaky result has an invalid ${label}.`);
    }
    return value;
}

function readDeFlakySummary(summaryPath = deflakySummaryPath) {
    let summary;
    try {
        summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    } catch (error) {
        throw new Error(`Could not read DeFlaky summary at ${summaryPath}: ${error.message}`);
    }

    if (!summary || typeof summary !== 'object' || !summary.result || typeof summary.result !== 'object') {
        throw new Error('DeFlaky summary is missing its result object.');
    }
    if (typeof summary.date !== 'string' || Number.isNaN(Date.parse(summary.date))) {
        throw new Error('DeFlaky summary is missing a valid run date.');
    }

    const result = summary.result;
    const runs = requireCount(summary.runs, 'run count');
    const totalDurationMs = requireCount(summary.totalDurationMs, 'total duration');
    const flakeScore = result.flakeScore;
    if (typeof flakeScore !== 'number' || !Number.isFinite(flakeScore) || flakeScore < 0 || flakeScore > 100) {
        throw new Error('DeFlaky result has an invalid FlakeScore.');
    }

    const details = result.details;
    if (!Array.isArray(details)) {
        throw new Error('DeFlaky result is missing its per-test details.');
    }

    return {
        date: summary.date,
        runs,
        totalDurationMs,
        flakeScore,
        totalTests: requireCount(result.totalTests, 'total test count'),
        stableTests: requireCount(result.stableTests, 'stable test count'),
        flakyTests: requireCount(result.flakyTests, 'flaky test count'),
        failingTests: requireCount(result.failingTests, 'failing test count'),
        details: details.map((detail) => {
            if (!detail || typeof detail !== 'object' || typeof detail.testName !== 'string') {
                throw new Error('DeFlaky result contains an invalid test detail.');
            }
            if (typeof detail.filePath !== 'string') {
                throw new Error(`DeFlaky result is missing the file path for "${detail.testName}".`);
            }
            const passRate = detail.passRate;
            if (typeof passRate !== 'number' || !Number.isFinite(passRate) || passRate < 0 || passRate > 100) {
                throw new Error(`DeFlaky result has an invalid pass rate for "${detail.testName}".`);
            }
            return {
                testName: detail.testName,
                filePath: detail.filePath,
                totalRuns: requireCount(detail.totalRuns, 'per-test run count'),
                passCount: requireCount(detail.passCount, 'per-test pass count'),
                failCount: requireCount(detail.failCount, 'per-test failure count'),
                passRate,
            };
        }),
    };
}

function formatDuration(durationMs) {
    const totalSeconds = Math.round(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function renderDeFlakySummary(summary) {
    const rows = summary.details.map((detail) => {
        const status = detail.failCount === 0
            ? 'Stable'
            : detail.passCount === 0
                ? 'Failing'
                : 'Flaky';
        return `<tr>
            <td>${escapeHtml(detail.testName)}<br><small>${escapeHtml(detail.filePath)}</small></td>
            <td>${detail.totalRuns}</td>
            <td>${detail.passCount}</td>
            <td>${detail.failCount}</td>
            <td>${detail.passRate.toFixed(1)}%</td>
            <td class="deflaky-state">${status}</td>
        </tr>`;
    }).join('');
    const testDetails = rows
        ? `<table class="deflaky-table">
            <thead><tr><th>Test</th><th>Runs</th><th>Passed</th><th>Failed</th><th>Pass rate</th><th>Result</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`
        : '<p class="ai-empty">DeFlaky reported no per-test details.</p>';

    return `<section class="deflaky-card">
        <h3>🔁 DeFlaky repeated-run results</h3>
        <div class="deflaky-meta">${summary.runs} runs · ${escapeHtml(new Date(summary.date).toLocaleString())} · ${formatDuration(summary.totalDurationMs)}</div>
        <div class="deflaky-counts">
            <div class="flaky-count"><div class="fc-num">${summary.flakeScore.toFixed(1)}%</div><div class="fc-label">FlakeScore</div></div>
            <div class="flaky-count"><div class="fc-num">${summary.totalTests}</div><div class="fc-label">Tests</div></div>
            <div class="flaky-count"><div class="fc-num">${summary.stableTests}</div><div class="fc-label">Stable</div></div>
            <div class="flaky-count flaky"><div class="fc-num">${summary.flakyTests}</div><div class="fc-label">Flaky</div></div>
            <div class="flaky-count fail"><div class="fc-num">${summary.failingTests}</div><div class="fc-label">Failing</div></div>
        </div>
        ${testDetails}
    </section>`;
}

function injectDeFlakySummary(html, summary) {
    const badgeMarker = '<!-- DEFLAKY_TAB_BADGE -->';
    const contentMarker = '<!-- DEFLAKY_REPORT_CONTENT -->';
    if (html.split(badgeMarker).length !== 2 || html.split(contentMarker).length !== 2) {
        throw new Error('The Customer Report does not contain the DeFlaky integration markers.');
    }

    const badge = `<span class="deflaky-tab-badge">DeFlaky ${summary.flakyTests} flaky</span>`;
    return html
        .replace(badgeMarker, badge)
        .replace(contentMarker, renderDeFlakySummary(summary));
}

function attachToLatestCustomerReport(startedAtMs, reportDirectory = customerReportDirectory, summaryPath = deflakySummaryPath) {
    if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
        throw new Error('Pass the Unix timestamp (milliseconds) from before the DeFlaky run.');
    }

    if (fs.statSync(summaryPath).mtimeMs < startedAtMs) {
        throw new Error('The DeFlaky summary was not updated during this run; refusing to attach stale results.');
    }

    const summary = readDeFlakySummary(summaryPath);
    const latestReport = fs.readdirSync(reportDirectory)
        .filter((name) => /^report_\d{8}_\d{6}\.html$/.test(name))
        .map((name) => {
            const reportPath = path.join(reportDirectory, name);
            return { reportPath, modifiedAt: fs.statSync(reportPath).mtimeMs };
        })
        .filter((report) => report.modifiedAt >= startedAtMs)
        .sort((left, right) => right.modifiedAt - left.modifiedAt)[0];

    if (!latestReport) {
        throw new Error('No Customer Report was generated during this DeFlaky run. Ensure CustomerReporter is enabled.');
    }

    const html = fs.readFileSync(latestReport.reportPath, 'utf8');
    const updatedHtml = injectDeFlakySummary(html, summary);
    fs.writeFileSync(latestReport.reportPath, updatedHtml, 'utf8');
    return latestReport.reportPath;
}

if (require.main === module) {
    try {
        const reportPath = attachToLatestCustomerReport(Number(process.argv[2]));
        console.log(`[DeFlaky report integration] Added DeFlaky results to ${path.relative(rootDirectory, reportPath)}`);
    } catch (error) {
        console.error(`[DeFlaky report integration] ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = { injectDeFlakySummary, readDeFlakySummary, renderDeFlakySummary };
