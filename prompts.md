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

### ⏳ Step 4: Demo & Documentation (PENDING)
- [ ] Test headful mode for demo
- [ ] Create timeproof screenshot
- [ ] Prepare Loom demo script

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
