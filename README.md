# Zoho Books Paid Invoice Collector (Node.js + Playwright)

## Overview
Browser automation agent that collects invoices with status **Paid** or **Partially Paid** from the Zoho Books Demo Company.  
The script navigates the demo site (without API), scrapes invoices across all pages, and outputs a CSV file with the required columns.

## Requirements
- Node.js 18+  
- npm  
- Playwright (Chromium)

## Setup
```bash
git clone <this-repo>
cd zoho-invoice-collector
npm install
npx playwright install chromium
```

## Run
Headless (default, CI-friendly):
```bash
npm run scrape
```

Headful (for demo / Loom recording):
```bash
npm run scrape:headful
```

## Output
- Generated CSV: `invoices.csv` in the project root  
- Columns: `invoice_id,customer,amount,paid_at,status`

## Notes
- Uses Playwright to simulate real user navigation (no API usage).  
- Filters strictly for invoices with **Paid** or **Partially Paid** status.  
- For Loom demo, use `npm run scrape:headful` to show browser actions.  
- Timeproof screenshot should be placed under `/timeproof` folder.
