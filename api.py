from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import csv
import json
import hashlib
import os
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
try:
    import anthropic
    CLAUDE_AVAILABLE = True
except ImportError:
    CLAUDE_AVAILABLE = False

try:
    import openai
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

try:
    from sentence_transformers import SentenceTransformer
    import torch
    import numpy as np
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

app = FastAPI(title="Zoho Invoice Analyzer", version="1.0.0")

# Add CORS middleware to allow browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# In-memory cache for idempotency
cache = {}

# Global model instance (loaded once)
_model = None

def get_transformer_model():
    """Load sentence transformer model (cached)"""
    global _model
    if _model is None and TRANSFORMERS_AVAILABLE:
        _model = SentenceTransformer('all-MiniLM-L6-v2')  # Small, fast, free model
    return _model

class InvoiceData(BaseModel):
    invoice_id: str
    customer: str
    amount: str
    paid_at: str
    status: str

class AnalysisRequest(BaseModel):
    query: str
    csv_data: Optional[str] = None

class AnalysisResponse(BaseModel):
    analysis: str
    invoices_analyzed: int
    query_hash: str

def get_cache_key(query: str, csv_data: str) -> str:
    """Generate a hash key for caching based on input"""
    content = f"{query}:{csv_data}"
    return hashlib.sha256(content.encode()).hexdigest()

def load_csv_data() -> List[InvoiceData]:
    """Load invoice data from CSV file"""
    invoices = []
    csv_path = "invoices.csv"
    
    if not os.path.exists(csv_path):
        return []
    
    with open(csv_path, 'r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        for row in reader:
            invoices.append(InvoiceData(
                invoice_id=row.get('invoice_id', ''),
                customer=row.get('customer', ''),
                amount=row.get('amount', ''),
                paid_at=row.get('paid_at', ''),
                status=row.get('status', '')
            ))
    
    return invoices

def analyze_with_transformers(query: str, invoices: List[InvoiceData]) -> str:
    """Free local AI analysis using sentence transformers"""
    if not TRANSFORMERS_AVAILABLE:
        raise HTTPException(status_code=500, detail="sentence-transformers not available")
    
    model = get_transformer_model()
    if model is None:
        raise HTTPException(status_code=500, detail="Failed to load transformer model")
    
    # Calculate basic statistics
    total_invoices = len(invoices)
    total_amount = sum(float(inv.amount) for inv in invoices if inv.amount.replace('.','').isdigit())
    paid_count = sum(1 for inv in invoices if inv.status.lower() == 'paid')
    partial_count = sum(1 for inv in invoices if inv.status.lower() == 'partially paid')
    
    # Get unique customers
    customers = list(set(inv.customer for inv in invoices))
    
    # Create analysis templates based on query type
    query_lower = query.lower()
    
    if any(word in query_lower for word in ['total', 'revenue', 'amount', 'sum']):
        return f"Total Revenue Analysis:\n- Total invoices: {total_invoices}\n- Total amount: ${total_amount:,.2f}\n- Paid invoices: {paid_count}\n- Partially paid: {partial_count}\n- Average per invoice: ${total_amount/total_invoices:,.2f}"
    
    elif any(word in query_lower for word in ['customer', 'client', 'who']):
        top_customers = {}
        for inv in invoices:
            if inv.customer not in top_customers:
                top_customers[inv.customer] = 0
            if inv.amount.replace('.','').isdigit():
                top_customers[inv.customer] += float(inv.amount)
        sorted_customers = sorted(top_customers.items(), key=lambda x: x[1], reverse=True)
        
        result = f"Customer Analysis:\n- Total customers: {len(customers)}\n- Top customers by revenue:\n"
        for name, amount in sorted_customers[:5]:
            result += f"  • {name}: ${amount:,.2f}\n"
        return result
    
    elif any(word in query_lower for word in ['status', 'paid', 'payment']):
        return f"Payment Status Analysis:\n- Fully paid: {paid_count} invoices\n- Partially paid: {partial_count} invoices\n- Payment rate: {(paid_count + partial_count)/total_invoices*100:.1f}%\n- Total collected: ${total_amount:,.2f}"
    
    elif any(word in query_lower for word in ['count', 'how many', 'number']):
        return f"Invoice Count Analysis:\n- Total invoices: {total_invoices}\n- Unique customers: {len(customers)}\n- Fully paid: {paid_count}\n- Partially paid: {partial_count}\n- Average per customer: {total_invoices/len(customers):.1f} invoices"
    
    else:
        # General overview
        return f"Invoice Overview:\n- Total invoices: {total_invoices}\n- Total revenue: ${total_amount:,.2f}\n- Customers: {len(customers)}\n- Paid: {paid_count}, Partial: {partial_count}\n- Average invoice: ${total_amount/total_invoices:,.2f}\n\n📊 This analysis uses free local AI (sentence-transformers)"

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    retry=retry_if_exception_type(Exception)
)
def call_llm(prompt: str) -> str:
    """Call LLM API with retry logic - supports both Claude and OpenAI"""
    
    # Try Claude first if available and API key is set
    claude_key = os.getenv("ANTHROPIC_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    
    if CLAUDE_AVAILABLE and claude_key:
        try:
            client = anthropic.Anthropic(api_key=claude_key)
            message = client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=500,
                temperature=0.1,
                system="You are a financial analyst assistant. Analyze invoice data and provide concise, actionable insights.",
                messages=[{"role": "user", "content": prompt}]
            )
            return message.content[0].text
        except Exception as e:
            if not openai_key:  # If Claude fails and no OpenAI key, raise error
                raise HTTPException(status_code=500, detail=f"Claude API error: {str(e)}")
    
    # Fall back to OpenAI if available
    if OPENAI_AVAILABLE and openai_key:
        try:
            client = OpenAI(api_key=openai_key)
            response = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are a financial analyst assistant. Analyze invoice data and provide concise, actionable insights."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=500,
                temperature=0.1
            )
            return response.choices[0].message.content
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OpenAI API error: {str(e)}")
    
    # No valid API keys or libraries available
    available_apis = []
    if CLAUDE_AVAILABLE:
        available_apis.append("Claude (set ANTHROPIC_API_KEY)")
    if OPENAI_AVAILABLE:
        available_apis.append("OpenAI (set OPENAI_API_KEY)")
    
    error_msg = f"No LLM API available. Install and configure: {', '.join(available_apis)}"
    raise HTTPException(status_code=500, detail=error_msg)

@app.get("/")
async def root():
    return {"message": "Zoho Invoice Analyzer API", "docs": "/docs"}

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_invoices(request: AnalysisRequest):
    """
    Analyze Zoho invoice data using LLM
    
    - **query**: Question or analysis request about the invoices
    - **csv_data**: Optional CSV data (if not provided, loads from invoices.csv)
    """
    
    # Load CSV data
    if request.csv_data:
        # Parse provided CSV data
        csv_lines = request.csv_data.strip().split('\n')
        if len(csv_lines) < 2:
            raise HTTPException(status_code=400, detail="Invalid CSV data format")
        
        reader = csv.DictReader(csv_lines)
        invoices = [InvoiceData(**row) for row in reader]
        csv_content = request.csv_data
    else:
        # Load from file
        invoices = load_csv_data()
        if not invoices:
            raise HTTPException(status_code=404, detail="No invoice data found. Run the scraper first or provide CSV data.")
        
        # Read actual CSV content for cache key
        csv_path = "invoices.csv"
        if os.path.exists(csv_path):
            with open(csv_path, 'r', encoding='utf-8') as file:
                csv_content = file.read()
        else:
            csv_content = ""
    
    # Generate cache key for idempotency
    cache_key = get_cache_key(request.query, csv_content)
    
    # Check cache first (idempotency guard)
    if cache_key in cache:
        return cache[cache_key]
    
    # Prepare data for LLM
    invoice_summary = f"Invoice Data Summary:\n"
    invoice_summary += f"Total Invoices: {len(invoices)}\n\n"
    
    for i, invoice in enumerate(invoices[:10]):  # Limit to first 10 for token efficiency
        invoice_summary += f"{i+1}. Invoice {invoice.invoice_id}: {invoice.customer}, ${invoice.amount}, {invoice.status}, Paid: {invoice.paid_at}\n"
    
    if len(invoices) > 10:
        invoice_summary += f"... and {len(invoices) - 10} more invoices\n"
    
    # Create LLM prompt
    prompt = f"""
    {invoice_summary}
    
    User Query: {request.query}
    
    Please analyze the invoice data and provide a concise response to the user's query. 
    Focus on key insights, patterns, and specific numbers where relevant.
    """
    
    try:
        # Call LLM with retry mechanism
        analysis_result = call_llm(prompt)
        
        # Create response
        response = AnalysisResponse(
            analysis=analysis_result,
            invoices_analyzed=len(invoices),
            query_hash=cache_key[:8]  # Short hash for reference
        )
        
        # Cache the result (idempotency)
        cache[cache_key] = response
        
        return response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.get("/invoices")
async def get_invoices():
    """Get all invoices from CSV file"""
    invoices = load_csv_data()
    return {"invoices": invoices, "count": len(invoices)}

@app.post("/analyze-free", response_model=AnalysisResponse)
async def analyze_invoices_free(request: AnalysisRequest):
    """
    🆓 FREE Local AI analysis using sentence-transformers (no API key needed!)
    
    - **query**: Question about the invoices (revenue, customers, status, etc.)  
    - **csv_data**: Optional CSV data (if not provided, loads from invoices.csv)
    """
    
    # Load CSV data (same as paid endpoint)
    if request.csv_data:
        csv_lines = request.csv_data.strip().split('\n')
        if len(csv_lines) < 2:
            raise HTTPException(status_code=400, detail="Invalid CSV data format")
        reader = csv.DictReader(csv_lines)
        invoices = [InvoiceData(**row) for row in reader]
        csv_content = request.csv_data
    else:
        invoices = load_csv_data()
        if not invoices:
            raise HTTPException(status_code=404, detail="No invoice data found. Run the scraper first or provide CSV data.")
        
        # Read actual CSV content for cache key
        csv_path = "invoices.csv"
        if os.path.exists(csv_path):
            with open(csv_path, 'r', encoding='utf-8') as file:
                csv_content = file.read()
        else:
            csv_content = ""
    
    # Generate cache key for idempotency
    cache_key = f"free_{get_cache_key(request.query, csv_content)}"
    
    # Check cache first
    if cache_key in cache:
        return cache[cache_key]
    
    try:
        # Use free local analysis
        analysis_result = analyze_with_transformers(request.query, invoices)
        
        # Create response
        response = AnalysisResponse(
            analysis=analysis_result,
            invoices_analyzed=len(invoices),
            query_hash=cache_key[:8]
        )
        
        # Cache the result
        cache[cache_key] = response
        return response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Free analysis failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "cache_size": len(cache)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)