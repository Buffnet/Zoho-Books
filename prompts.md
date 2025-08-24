# Prompts.md — Zoho Books Paid Invoice Collector (Node.js Version)

These are the prompts I used with Claude AI to complete the challenge in under 2 hours. Each shows how it helped.

## Progress Tracking

### ✅ Step 1: Project Setup & Dependencies (COMPLETED)
- [x] Initialize Node.js project with `npm init -y`
- [x] Install Playwright: `npm install playwright`
- [x] Install Chromium browser: `npx playwright install chromium`
- [x] Set up package.json scripts (`npm run scrape`, `npm run scrape:headful`)
- [x] Create `/scripts` directory structure

### ✅ Step 2: Core Scraper Implementation (COMPLETED)
- [x] Create `scripts/scrape.js` with Playwright automation
- [x] Navigate to Zoho Books Demo → Sales → Invoices
- [x] Filter for "Paid" or "Partially Paid" invoices only
- [x] Handle pagination and dynamic loading
- [x] Extract data: invoice_id, customer, amount, paid_at, status
- [x] Generate CSV output with correct headers
- [x] Add headful demo mode for video recording

### ✅ Step 3: Data Validation & Edge Cases (COMPLETED)
- [x] Add currency normalization for amounts (removes $, commas, .00)
- [x] Implement fallback selectors for status and customer parsing
- [x] Improve date parsing robustness (multiple date formats)
- [x] Test pagination across all pages
- [x] Remove debug output for cleaner production code
- [x] Verify idempotent CSV overwrites
- [x] Add comprehensive error handling

### ✅ Step 4: Demo & Documentation (COMPLETED)
- [x] Test headful mode for demo
- [x] Create timeproof screenshot
- [x] Prepare Loom demo script

### ✅ Step 5: FastAPI LLM Endpoint (COMPLETED)
- [x] Set up FastAPI project structure with Python dependencies
- [x] Create LLM endpoint that processes Zoho CSV data and returns JSON
- [x] Add retry mechanism for transient errors using tenacity
- [x] Implement idempotency guard (same input → same output without re-processing)
- [x] Create simple README section with FastAPI run commands
- [x] Test the endpoint works end-to-end

### ✅ Step 6: Scraper Hardening & Schema Drift Detection (COMPLETED)
- [x] Replace brittle text-based parsing with stable column selectors
- [x] Add schema drift detection (error rate monitoring, structure validation)
- [x] Implement deduplication by invoice_id
- [x] Add fail-fast validation for required columns
- [x] Add comprehensive error tracking and reporting
- [x] Improve robustness against DOM structure changes

---

## Prompt 1: Planning & Setup (5 min)
```
You are my coding copilot for a 2-hour timeboxed task.  
Goal: in a fresh Node.js project, build a browser-based automation agent (no API usage) that navigates to Zoho Books Demo → Sales → Invoices, collects ONLY invoices with status "Paid" or "Partially Paid", and saves a CSV with columns: invoice_id, customer, amount, paid_at, status.

Constraints:
- Use Node.js + Playwright with Chromium.
- Minimal setup, easy to run from scratch.
- Deliverables: repo with ≤200-word README, /prompts.md, Loom ≤3 min, /timeproof screenshot.
- Timebox: 2 hours end-to-end.

Please output a concise plan with exact commands (npm init, npm install playwright), file paths, and where to put code. Include selectors strategy, pagination handling, waits for dynamic tables, and CSV write path. Keep it under 20 bullet points.
```
**How it helped:** Produced a clear, runnable action plan with zero meta overhead.

---

## Prompt 2: Core Scraper Implementation (25–50 min)
```
Generate a Node.js Playwright script "scripts/scrape.js" that:
1) Opens Zoho Books Demo dashboard and navigates Sales → Invoices.
2) Collects only invoices with status "Paid" or "Partially Paid".
3) Scrapes table rows across all pages, collecting:
   - invoice_id
   - customer
   - amount
   - paid_at (if visible; else blank)
   - status
4) Handles dynamic loading and pagination.
5) Writes CSV with exact header: invoice_id,customer,amount,paid_at,status
6) Uses stable selectors and waitForSelector() (no arbitrary sleeps).
7) Provides headless by default, toggle headful with env var.
```
**How it helped:** Delivered a working scraper script in one file with robust waits and pagination.

---

## Prompt 3: Data Validation & Edge Cases (10–15 min)
```
Review the script for correctness:
- Only Paid / Partially Paid rows collected.
- CSV columns match exactly.
- Amounts normalized (no currency symbols).
- Dates parsed if visible.
- Pagination collects all pages.
- Script is idempotent (overwrites CSV on rerun).

Now produce a patch that:
- Adds currency normalization.
- Adds fallback selectors.
- Improves date parsing robustness.
```
**How it helped:** Hardened against flaky selectors and inconsistent formats.

---

## Prompt 4: Documentation & Demo Prep (5–10 min)
```
Write a crisp README.md (≤200 words) for this repo.  
Include:
- Requirements (Node.js, npm, Playwright install command).
- Exact commands to run (npm run scrape / scrape:headful).
- CSV output location and format.
- Notes for Loom demo (headful mode).
```
**How it helped:** Gave me a concise README that reviewers can follow instantly.

---

## Prompt 5: Loom Script & Timeproof (3–5 min)
```
Write a ≤3-minute Loom narration script and checklist that shows:
1) Opening Zoho Books Demo and navigating to Invoices.
2) Running `npm run scrape:headful` and showing browser run.
3) Displaying invoices.csv with correct columns.
4) Mentioning the /timeproof screenshot.

Return a bullet list narration + one-liner for timestamped screenshot (Linux/macOS).
```
**How it helped:** Provided a ready demo script and screenshot command with no wasted time.

---

## Prompt 6: FastAPI LLM Endpoint (30–45 min)
```
Hi! I have another small task. Do you have an idea how we can do that? 
One last async checkbox so we're fully aligned with our stack (kept tiny and time-boxed 30–45 min): 
• Stand up a small FastAPI endpoint that calls an LLM and returns JSON (any simple example is fine — generic, or reusing your Zoho CSV; your choice). 
• Add minimal production hygiene: basic retry on transient errors and a simple idempotency guard (same input → same output without re-processing). 
• Record a ≤60-sec Loom in Cursor or Claude Code (Copilot/Cody also fine) with the AI suggestions visible. 
• Share the repo + a 1-minute README (run commands). Send the Loom + repo when ready, and two 15-min slots in the next 48h for a quick debrief.
```
**How it helped:** Extended the existing Zoho scraper with a production-ready API endpoint featuring LLM analysis, retry logic, and caching for a complete data pipeline demo.

---

## Prompt 7: Scraper Hardening & Production Readiness (COMPLETED)
```
ok, perfect. Now we need to make a refactor of file @scripts/scrape.js 
It is working now, but. 
the current parsing grabs row.textContent and regexes status/customer/amount. That's brittle if Zoho tweaks the DOM.

How would you harden it? For example:
• Anchor on stable column selectors or attributes (e.g., table tbody tr td:nth-child(...), data-*) instead of free-text.
• Add a tiny snapshot/unit test on saved invoice HTML + a "schema-drift" alert (e.g., paid rows drop to 0 or parse error rate >3%).
• Dedupe by invoice_id and fail fast if required columns aren't found.

Also please update @prompts.md with this new refactor step
```
**How it helped:** Transformed brittle text-parsing scraper into robust column-based parser with schema drift detection, deduplication, and fail-fast validation - making it production-ready against DOM changes.

**Production improvements implemented in scripts/scrape-v2.js:**
- [x] Locator API instead of CSS selectors with :has-text()
- [x] Replace networkidle with UI-driven waits  
- [x] Add iframe detection and handling
- [x] Replace timeouts with deterministic waits
- [x] Wire up page console logging for debugging
- [x] Implement proper CSV escaping for quotes/commas/newlines
- [x] Use role-based navigation selectors 
- [x] Add screenshot and HTML capture on schema drift
- [x] Improve invoice parsing with cell order and data attributes
- [x] Use semantic pagination with proper ARIA roles
- [x] Guard browser.close() in finally block
