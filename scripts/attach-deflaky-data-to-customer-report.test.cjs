const test = require('node:test');
const assert = require('node:assert/strict');
const { injectDeFlakySummary } = require('./attach-deflaky-data-to-customer-report.cjs');

const summary = {
    date: '2026-11-15T10:51:56.396Z',
    runs: 2,
    totalDurationMs: 43717,
    flakeScore: 100,
    totalTests: 1,
    stableTests: 1,
    flakyTests: 0,
    failingTests: 0,
    details: [{
        testName: 'checkout test',
        filePath: 'ai/checkout.spec.ts',
        totalRuns: 2,
        passCount: 2,
        failCount: 0,
        passRate: 100,
    }],
};

test('embeds DeFlaky metrics and per-test outcomes into the Flaky tab', () => {
    const report = '<button><!-- DEFLAKY_TAB_BADGE --></button><div><!-- DEFLAKY_REPORT_CONTENT --></div>';
    const updated = injectDeFlakySummary(report, summary);

    assert.match(updated, /DeFlaky 0 flaky/);
    assert.match(updated, /100\.0%/);
    assert.match(updated, /checkout test/);
    assert.match(updated, /Stable/);
    assert.doesNotMatch(updated, /DEFLAKY_(TAB_BADGE|REPORT_CONTENT)/);
});

test('escapes test metadata before adding it to report HTML', () => {
    const report = '<button><!-- DEFLAKY_TAB_BADGE --></button><div><!-- DEFLAKY_REPORT_CONTENT --></div>';
    const unsafeSummary = {
        ...summary,
        details: [{
            ...summary.details[0],
            testName: '<img src=x onerror=alert(1)>',
            filePath: 'specs/<checkout>.ts',
        }],
    };

    const updated = injectDeFlakySummary(report, unsafeSummary);
    assert.match(updated, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(updated, /specs\/&lt;checkout&gt;\.ts/);
    assert.doesNotMatch(updated, /<img src=x/);
});

test('fails explicitly when the Customer Report is missing integration markers', () => {
    assert.throws(
        () => injectDeFlakySummary('<html></html>', summary),
        /does not contain the DeFlaky integration markers/,
    );
});
