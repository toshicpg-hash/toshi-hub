# Isolated TOSHI HUB UI verification

This branch is a synthetic QA build only. Do not merge it into production.

Personal financial/calendar bootstrap migrations and account-specific OAuth configuration have been removed. The work classification, input, rendering, completion and synchronization functions are the candidate production functions. Browser tests use fresh synthetic storage and intercept every request; external account calls are blocked. The original production migration code and existing user storage are not modified by this test build.

Run `node --test tests/work-rules.test.cjs` and, with Playwright 1.62.1 plus Chromium installed, `node tests/work-rules.browser.cjs`.

Use a fresh browser context on an isolated test origin only. Never open this build on the production origin or reuse a profile containing real account storage. The automated harness enforces fresh contexts and blocked external requests. Service worker registration is disabled in the QA source. Production storage keys remain solely to test compatibility.
