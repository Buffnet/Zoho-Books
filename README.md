# Zoho Books Invoice Collector & AI Analyzer

## Overview
1. **Node.js Scraper**: Browser automation agent that collects invoices with status **Paid** or **Partially Paid** from Zoho Books Demo
2. **FastAPI Endpoint**: LLM-powered analysis service with retry logic and idempotency

## Requirements
- Node.js 18+ & npm (for scraper)
- Python 3.8+ (for API)
- Claude API key OR OpenAI API key

## Setup
```bash
# Clone and install Node.js dependencies
npm install
npx playwright install chromium

# Install Python dependencies
pip install -r requirements.txt

# Set LLM API key (choose one)
export ANTHROPIC_API_KEY="your-claude-key-here"   # For Claude
export OPENAI_API_KEY="your-openai-key-here"      # For OpenAI
```

## Quick Start (Step-by-Step)

### 1. Collect Invoice Data
```bash
npm run scrape              # Headless mode
npm run scrape:headful      # For demo/recording (browser visible)
```
→ Generates `invoices.csv` with paid/partially paid invoices

### 2. Start API Server
```bash
python3 api.py              # Starts server on http://localhost:8000
# or use: uvicorn api:app --reload
```

### 3. Analyze with AI

**🆓 FREE Local Analysis (No API Key Required):**
```bash
curl -X POST "http://localhost:8000/analyze-free" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the total revenue from paid invoices?"}'
```

**🔑 Premium LLM Analysis (API Key Required):**
```bash
curl -X POST "http://localhost:8000/analyze" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the total revenue from paid invoices?"}'
```

**View Data & Docs:**
```bash
curl http://localhost:8000/invoices    # View collected invoices
open http://localhost:8000/docs        # Interactive API docs
```

## API Endpoints
- **GET `/`**: API info
- **POST `/analyze`**: Analyze invoices with LLM (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)
- **POST `/analyze-free`**: 🆓 **FREE** Local AI analysis (no API key needed!)
- **GET `/invoices`**: View raw CSV data
- **GET `/health`**: Health check + cache status

## Output
- CSV: `invoices.csv` (invoice_id, customer, amount, paid_at, status)
- API docs: `http://localhost:8000/docs`
